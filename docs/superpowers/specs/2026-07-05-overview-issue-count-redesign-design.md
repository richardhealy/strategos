# Overview redesign: issue-count signal

**Date:** 2026-07-05
**Status:** Approved (design), pending implementation plan
**Scope:** The `/` Overview dashboard only. The risk engine (`recomputeRisk`,
`scoreScheduleRisk`) and the `/risks` page are **not** touched.

## Problem

After a live Linear sync the Overview is uniformly red and empty of signal:
every initiative shows `Critical` / `at risk`, progress bars are all zero, and
"Velocity by team" is blank.

Root cause is a data/model mismatch, not a sync failure:

- `scoreScheduleRisk` computes `capacity = velocityPerSprint × sprintsRemaining`.
  When `capacity ≤ 0` the work/capacity ratio becomes `Infinity` → score `1` →
  `CRITICAL`, regardless of how much work actually remains.
- The synced Linear data has **none** of the signals that model needs:
  - 0 / 1201 tasks carry estimates → `remainingPoints = 0` everywhere.
  - 0 / 14 initiatives have target dates → `sprintsRemaining = 0`.
  - 0 velocity snapshots / 0 teams → `velocityPerSprint = 0`.

So all 14 initiatives are force-scored `CRITICAL`, progress (points-based) is 0,
and there is no velocity series to draw.

This workspace tracks work by **issue count**, not story points. The Overview
must be rebuilt on the signals that actually exist.

## Available signals (measured, 2026-07-05)

| Signal | Availability | Use |
| --- | --- | --- |
| `status` (DONE / IN_PROGRESS) | 675 done / 526 open of 1201 | Progress by count |
| `priority` (0–4) | Fully populated: 145 none · 192 urgent · 424 high · 315 med · 125 low | "Where's the important open work" |
| `blockedBy` dependencies | Sparse but real: 10 open issues, 13 edges | Blocked list |
| `updatedAt` staleness | **Unusable** — equals DB write time (all < 7d) | — |
| WIP vs backlog split | **Unusable** — sync flattens all non-done Linear states to `IN_PROGRESS` | — |

Priority scale is Linear's, passed through verbatim: `1` Urgent, `2` High,
`3` Medium, `4` Low, `0` None.

## Design

### Pure aggregation module — `src/state/model/overview.ts`

All counting/bucketing logic lives here as pure functions (mirrors the existing
`matrix.ts` / `scoring.ts` pattern) so it is unit-testable without a DB.

- `progressOf(tasks: {status}[]) → { done, total, pct }` — `pct = done/total`
  (`0` when `total = 0`).
- `PRIORITY_BUCKETS` / `bucketOpenByPriority(tasks: {status, priority}[]) →
  { urgent, high, medium, low }` — counts **open** (`status !== "DONE"`) tasks per
  priority. Priority `0` (None) folds into `low`. Documented in the module.
- `rollupKpis(initiatives, tasks) → { totalIssues, doneIssues, openIssues,
  completePct, urgentHighOpen }` where `urgentHighOpen` = open tasks with
  priority `1` or `2`.
- `progressBand(pct) → "low" | "medium" | "high"` — completion band for the
  progress-bar colour. Neutral/positive framing (higher completion = greener);
  low completion is **not** labelled as risk.

### Repository read methods — `src/state/model/repository.ts`

Thin methods that fetch rows and delegate to the pure module. Added, not
replacing the existing methods (which other pages/agents still use):

- `overviewKpis(programId) → { totalIssues, doneIssues, openIssues,
  completePct, urgentHighOpen, pendingApprovals }`.
- `openWorkByPriority(programId) → { id, title, urgent, high, medium, low }[]`
  (one row per initiative, ordered by `createdAt`).
- `initiativesWithProgress(programId) → { id, title, owner, done, total, pct,
  band }[]`.
- `blockedIssues(programId, limit = 12) → { externalId, title, blockers:
  {title}[] }[]` — open tasks with ≥1 blocker.

### UI — `app/(dash)/page.tsx` + components

KPI tiles (5):

| Slot | Label | Value |
| --- | --- | --- |
| 1 | Complete | `56%` — sub `675/1201` |
| 2 | Initiatives | `14` |
| 3 | Open issues | `526` |
| 4 | Urgent/high open | count of open priority 1–2 |
| 5 | Awaiting you | approvals (unchanged) |

Panels:

- **Open work by priority** (replaces Risk heatmap): new component
  `components/viz/PriorityHeatmap.tsx`. Same grid shape as `RiskHeatmap` — rows =
  initiatives, columns = Urgent / High / Medium / Low — each cell shaded by the
  count of open issues at that priority (darker = more). Reads
  `openWorkByPriority`.
- **Blocked** (replaces Velocity by team): new component
  `components/viz/BlockedList.tsx` (or inline) listing blocked open issues and
  what blocks each. Reads `blockedIssues`. Empty state: "Nothing blocked."
- **Initiatives**: progress bar driven by issue count; row shows `done/total` and
  `pct`, bar coloured by `band`. Badge shows `pct%` (informational, not "at
  risk").
- **Awaiting approval**: unchanged.

`RiskHeatmap` and `VelocityBars` are no longer imported by the Overview; they
remain in the tree for any other consumer.

## Testing

- `tests/overview.test.ts` — unit tests for the pure module: `progressOf`
  (including `total = 0`), `bucketOpenByPriority` (None→low fold, DONE excluded),
  `rollupKpis`, `progressBand` boundaries.
- Repository methods verified by driving the running app (SSR HTML shows real
  counts) rather than DB-integration tests, consistent with the existing suite.

## Out of scope (flagged, not silently dropped)

- `recomputeRisk` still writes bogus `SCHEDULE` scores each sync, and `/risks`
  still displays them. Left for a follow-up. (Cheap future guard: return LOW when
  `remainingPoints ≤ 0`.)
- Canceled Linear issues collapse to `DONE`, so progress % counts them as
  complete. Needs a real `CANCELED` status to fix.
- WIP/backlog split and true staleness both require the sync to persist Linear's
  `stateType` and real `updatedAt` (both are pulled today but dropped in
  `map.ts`). Future enhancement.
