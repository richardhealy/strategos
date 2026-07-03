# strategos — Linear integration (M1) design

**Date:** 2026-07-03
**Status:** Approved (brainstorm), pending implementation plan
**Scope:** Connect strategos to a real Linear workspace — full M1 for Linear (read sync + webhooks + writes through the HITL gate) — and generalize the sync reconcile so the other four trackers become drop-in adapters. Linear is the reference implementation; Jira/GitHub/GitLab/Azure remain stubs.

## Problem

strategos's dashboard currently runs entirely off a seeded demo Program. The `Integration` port, registry, webhook route, and durable routines exist, but the Linear adapter is a stub: every `pull*` returns `[]`, `verifyWebhook` returns `false`, `parseWebhook`/`writeTicket` throw, and `syncEngine` only writes a placeholder provenance row (`TODO(M1)`). This is spec Milestone M1 ("State sync"), currently "Not started." This design makes Linear real and generalizes the reconcile path.

## Decisions (locked during brainstorm)

- **Linear workspace shape:** Projects → Issues + Cycles (no Linear Initiatives).
- **Epic layer:** Project Milestones → Epics.
- **Auth:** Personal API key (`LINEAR_API_KEY`) via `@linear/sdk`; OAuth deferred.
- **Program scoping:** one strategos Program per configured set of Linear teams (`LINEAR_TEAM_KEYS`); its Projects become that Program's Initiatives.
- **Seed coexistence:** the synced real Program lives alongside the demo Program; the Overview prefers the synced Program, and the sidebar "Program" chip becomes a switcher.
- **Generalize the reconcile** (not just Linear): one `upsertByRef` helper reused by every entity type.

## Object mapping (Linear → strategos)

| Linear | strategos | Field notes |
|--------|-----------|-------------|
| Project | Initiative | `title`, project lead → `owner`, `targetDate`, state → `status` |
| Project Milestone | Epic | issues grouped by milestone; un-milestoned issues → a per-project "General" Epic; `Epic.teamId` = dominant team of the epic's issues |
| Issue | Task | `estimate` → `estimatePoints`, `assignee`, state → `status`; `criticalPath` from priority/blocking; `stalledSince` from staleness (in-progress + no update past the team's cycle time) |
| Team | Team | by team key |
| Cycle | VelocitySnapshot | per team per cycle: `completedPts`, `committedPts` |
| Issue blocking relations | Dependency (Epic→Epic) | issue "blocks/blocked-by" aggregated to the owning Epics; skip self-edges |

Every synced row gets an **`ExternalRef`** (`kind=LINEAR`, `externalId`) so re-syncs upsert; every changed field writes a `StateChange` via `recordChange`.

## Architecture

```
src/integrations/linear/
  client.ts    # @linear/sdk client, constructed from LINEAR_API_KEY; throws a clear error if unset
  pull.ts      # GraphQL → Raw* shapes: projects, projectMilestones, issues, cycles, teams
  webhook.ts   # verifyWebhook (HMAC-SHA256, timing-safe) + parseWebhook (resource + externalId)
  write.ts     # writeTicket -> issueCreate / issueUpdate
  index.ts     # LinearIntegration implements Integration, delegating to the above
src/state/sync/
  reconcile.ts   # upsertByRef<T> generic + per-entity reconcilers (initiatives/epics/tasks/velocity/deps)
  syncEngine.ts  # orchestrate per kind: pull -> reconcile -> recomputeRisk; SyncCursor deltas
src/state/model/
  recompute.ts   # recomputeRisk(programId) — extracted from the seed, shared by seed + sync
src/config/linear.ts  # env parsing: LINEAR_API_KEY, LINEAR_WEBHOOK_SECRET, LINEAR_TEAM_KEYS
```

Design rule preserved: the agent reads freely; the ONLY outward write path is `writeTicket`, reachable only via the HITL gate.

### The generalization: `upsertByRef`

```
upsertByRef<TRaw, TRow>({
  kind, externalId,          // identity
  entityType,                // "Initiative" | "Epic" | "Task" ...
  load,                      // () => existing row via ExternalRef, or null
  create, update,            // persist
  diff,                      // (before, after) => changed fields -> recordChange
}): Promise<{ row: TRow; changed: boolean }>
```

Each per-entity reconciler is a thin wrapper over this. Adding a new tracker later is a new adapter under `src/integrations/<kind>/`, with zero reconcile changes.

## Data flow

```
scheduled routine (daily) OR webhook on-event
  └─ syncIntegration(LINEAR)
       ├─ resolve/create Program for LINEAR_TEAM_KEYS
       ├─ pullInitiatives  (Projects)      -> reconcileInitiatives -> upsertByRef
       ├─ pullEpics        (Milestones)    -> reconcileEpics       -> upsertByRef (+ teamId, deps)
       ├─ pullTasks        (Issues)        -> reconcileTasks       -> upsertByRef
       ├─ pullDeliveryHistory (Cycles)     -> reconcileVelocity    -> VelocitySnapshot upsert
       └─ recomputeRisk(programId)         -> RiskScore rows via scoreScheduleRisk + velocity engine
  └─ dashboard reads the same programModel methods (unchanged) over the synced Program
```

`recomputeRisk` is the same engine the seed uses — real Linear data and demo data flow through identical scoring.

## Webhooks

- `verifyWebhook(headers, body)`: `crypto.timingSafeEqual(hmacSHA256(body, LINEAR_WEBHOOK_SECRET), headers["linear-signature"])`. Returns false on any mismatch or missing secret.
- `parseWebhook(body)`: read Linear's `{ type, data }` → `{ resource, externalId }`.
- Route `app/api/webhooks/[kind]/route.ts` (exists) verifies then enqueues Inngest `integration/webhook`. The on-event routine does a **targeted resync** of the changed resource (single project/issue), not a full sync, then `recomputeRisk` for the affected initiative. Target: model updated within 60s of the event.
- Setup: register a webhook in Linear (Settings → API → Webhooks) → `<deploy>/api/webhooks/linear`, secret → `LINEAR_WEBHOOK_SECRET`.

## Writes through HITL

- A `TICKET_WRITE` proposal payload: `{ kind: "LINEAR", action: "create" | "update", issue: { id?, title?, description?, stateId?, ... } }`.
- Replace the simulated TICKET_WRITE effect in `src/hitl/effects.ts` with a real router: `integrationFor(payload.kind).writeTicket(payload.issue-shaped payload)` → Linear `issueCreate`/`issueUpdate` → `{ ref: issue.id, url }`.
- Flow unchanged: propose → human approves → `apply` → `writeTicket`. After a successful write, trigger a targeted resync so the model reflects the new/updated issue.
- COMMUNICATION and PLAN_CHANGE stay simulated (out of scope; not Linear actions).

## Risk recompute (DRY with the seed)

Extract the seed's per-initiative scoring into `recomputeRisk(programId)`:
- For each Initiative: `remainingPoints` = sum of non-DONE task points; `velocityPerSprint` from the initiative's team VelocitySnapshots; `sprintsRemaining` from `targetDate`; `scoreScheduleRisk(...)` → upsert SCHEDULE `RiskScore`.
- DEPENDENCY risk from unresolved Epic dependencies; BLOCKER from stalled critical-path tasks; TEAM from velocity trend.
- The seed calls `recomputeRisk` too, so both paths share one engine.

## Error handling

- Missing `LINEAR_API_KEY` → `syncIntegration(LINEAR)` fails fast with a clear message; `syncAll` records `-1` for that kind and continues (existing behavior).
- Linear API errors (rate limit, auth) are caught per-reconciler, logged with context, and abort that kind's sync without corrupting the model (no partial cursor advance on failure).
- Webhook with a bad/missing signature → 401 (existing route behavior), never reaches the model.

## Testing

- **Pure mapping** (`pull.ts` shapers): fixture Linear payloads → `Raw*` shapes; no network. Cover projects, milestones (incl. un-milestoned issues → General epic), issues (estimate/assignee/state/stalled), cycles → delivery.
- **Reconcile** (`reconcile.ts`): `upsertByRef` create vs update vs no-op; `ExternalRef` identity; `recordChange` only on real diffs — mocked `db` (same pattern as `tests/hitl.gate.test.ts`).
- **Webhook verify:** known body+secret → true; tampered body or wrong secret → false; missing secret → false.
- **`recomputeRisk`:** fixture raw facts → engine-computed severities (reuses the `scoreScheduleRisk` invariants already pinned by `tests/risk.scoring.test.ts`).
- **Manual smoke:** with a real `LINEAR_API_KEY`, run the sync against a sandbox workspace and confirm the dashboard shows real projects/issues; documented in the plan, not automated.

## Phasing (the plan will follow this)

- **L1 — Read sync:** client + pull + generalized reconcile + `recomputeRisk` + Program scoping + dashboard program switcher. Outcome: the dashboard shows your real Linear program, risk engine-computed over real data.
- **L2 — Webhooks:** verify + parse + targeted on-event resync within 60s.
- **L3 — Writes:** real `writeTicket` through the HITL gate + reflect-back sync.

## Definition of done

1. With `LINEAR_API_KEY` + `LINEAR_TEAM_KEYS` set, a sync creates a Program whose Initiatives/Epics/Tasks/Teams/velocity mirror the configured Linear projects, and the dashboard renders it.
2. Risk scores on that Program are produced by `scoreScheduleRisk`/velocity over the synced data (not fixtures).
3. A Linear webhook updates the model within 60s of the event (verified signature required).
4. A `TICKET_WRITE` proposal, once approved, creates/updates a real Linear issue via the gate and is reflected back by sync; an unapproved one cannot write (existing adversarial test still holds).
5. Re-running a sync is idempotent (upsert by `ExternalRef`, no duplicates) and records provenance for every changed field.
6. Adding a second tracker requires only a new adapter under `src/integrations/<kind>/` — no reconcile-engine changes.

## Out of scope

- Jira/GitHub/GitLab/Azure adapters (stubs remain; the generalized reconcile makes them additive).
- OAuth (PAT only for v1).
- Real COMMUNICATION/PLAN_CHANGE effects (stay simulated).
- Backfilling historical velocity beyond what Linear cycles expose.
