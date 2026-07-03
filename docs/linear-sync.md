# Running a Linear sync (L1)

L1 is read-only: it pulls your Linear workspace into the strategos program model
and recomputes risk with the real engine. Webhooks (L2) and writes (L3) below.

## Mapping

| Linear | strategos |
|--------|-----------|
| Project | Initiative |
| Project Milestone | Epic (un-milestoned issues → a per-project "General" epic) |
| Issue | Task |
| Team | Team |
| Cycle | VelocitySnapshot (drives velocity + schedule risk) |

## Steps

1. Set in `.env`:
   - `LINEAR_API_KEY` — Linear → Settings → API → Personal API keys.
   - `LINEAR_TEAM_KEYS=ENG,OPS` (optional) — which teams' projects to sync; empty = all.
2. Start Postgres and apply migrations:
   ```bash
   docker compose up -d
   npx prisma migrate dev
   ```
3. Run a one-off sync:
   ```bash
   npx tsx -e "import 'dotenv/config'; import { syncIntegration } from './src/state/sync/syncEngine'; syncIntegration('LINEAR').then(r => { console.log(r); process.exit(0); });"
   ```
   Expected output like `{ initiatives: N, epics: M, tasks: K, velocity: V, scored: N }`.
4. Start the app and view the result:
   ```bash
   npm run dev
   ```
   Open http://localhost:3000 — the dashboard now shows the synced Linear program
   (projects as initiatives, milestones as epics, issues as tasks), with schedule
   risk recomputed by the engine. The sidebar shows the synced program's name.

## Notes

- Re-running the sync is idempotent (rows are matched by `ExternalRef`), and every
  changed field writes a provenance row.
- L1 does not yet set `Epic.teamId` from issues, so velocity-based risk is
  conservative until a later refinement.

## Webhooks (L2)

1. Set `LINEAR_WEBHOOK_SECRET` in `.env` (any strong random string you also give Linear).
2. In Linear → Settings → API → Webhooks, create a webhook:
   - URL: `<your deploy>/api/webhooks/linear`
   - Secret: the same `LINEAR_WEBHOOK_SECRET`
   - Subscribe to Issues / Projects / Cycles.
3. On a change in Linear, the route verifies the `linear-signature` HMAC + a 60s
   replay window, then emits `integration/webhook`; the `onWebhook` Inngest
   function runs an idempotent `syncIntegration('LINEAR')`, updating the model
   within ~60s. (True per-resource targeting is a later optimization; the full
   resync is idempotent via `ExternalRef`.)
4. Locally, run the Inngest dev server alongside the app to process events:
   `npm run inngest:dev`.

## Writes (L3) — through the HITL gate

Writes require the Linear API key to have write scope. Nothing writes without a
human approving the proposal first.

1. An agent proposes a `TICKET_WRITE` with payload
   `{ kind: "LINEAR", action: "create" | "update", issue: { teamId?, id?, title?, description?, stateId? } }`.
2. It appears in the dashboard approval inbox. On **Approve**, the gate's `apply`
   runs the `TICKET_WRITE` effect → `LinearIntegration.writeTicket` →
   `issueCreate`/`issueUpdate`. An unapproved proposal cannot write (the gate's
   hard stop is pinned by `tests/hitl.gate.test.ts`).
3. The new/updated issue is reflected back into the model by the next scheduled
   or webhook sync (idempotent via `ExternalRef`).

Manual smoke: seed a `TICKET_WRITE` proposal (or have an agent create one),
approve it in the dashboard, and confirm the issue appears/updates in Linear.
Requires a write-scoped `LINEAR_API_KEY`.
