# strategos dashboard — design

**Date:** 2026-07-03
**Status:** Approved (brainstorm), pending implementation plan
**Scope:** Build strategos a dense, dark "Command Center" Overview dashboard whose every value is computed by the real engine over a believable seeded program. Extraction of the reusable kit into blueprint is a documented follow-on, not part of this work.

## Problem

The app works end to end (backend, integrations, agents, HITL gate, migrations, deploy path) but the frontend is a single inline-styled page over an almost-empty database, so it fails to show the power of what's been built. Two compounding causes: (1) no compelling data, (2) no real visual design.

## Decisions (locked during brainstorm)

- **Sequencing:** strategos-first, then extract the reusable kit into a blueprint template module.
- **Data:** engine-computed from a realistic seed — raw facts seeded, then the actual scoring/velocity/HITL code run to produce the derived values shown.
- **Layout:** Command Center — dense, dark ops-console. Sidebar nav + KPI strip + tight panel grid.
- **Palette:** Tokyo Night — base `#0b0e14`, indigo accent `#7aa2f7`. Semantic severity constant across the app: green `#9ece6a` / amber `#e0af68` / red `#f7768e`; HITL blue `#7aa2f7` means "needs a human".
- **Panel set (Overview):** KPI strip (Health, On-track, Open risks, Predicted slips, Awaiting approval) + Risk heatmap + Velocity by team + Initiatives table + HITL approval inbox.
- **Nav:** Overview · Initiatives · Risks · Sprints · Communications · Audit log.

## Non-goals

- No Tailwind and no chart library — dependency-light so the kit extracts cleanly.
- Sprints and Communications ship as light list views this pass, not full-feature pages.
- No live integrations (they need credentials); the seed stands in for synced data.
- Extraction into blueprint/setup-project is out of scope for this plan (documented as a follow-on).

## Tech approach

Dependency-light, so the kit can later become a blueprint template module.

- **Design tokens — `app/tokens.css`:** CSS custom properties for base surfaces, severity colors, HITL blue, spacing, radii, typography. This is the theme; components reference variables, never hard-coded hex.
- **UI primitives — `src/components/ui/`:** small single-purpose server components — `Sidebar`, `Panel`, `KpiTile`, `Badge`, `ProgressBar`. Each has one clear job, is understandable in isolation, and takes typed props.
- **Visualizations — `src/components/viz/`:** hand-rolled SVG/CSS, no deps — `RiskHeatmap` (initiative × risk-kind grid), `VelocityBars` (per-team bars + trend arrow), `HealthDial` (donut score). Pure presentational components fed by repository query output.

## Data flow

```
prisma/seed.ts
  ├─ insert raw facts: program, teams, initiatives, epics, tasks (points+status),
  │  VelocitySnapshot history, dependencies, target dates
  ├─ run the REAL engine over those facts:
  │    scoreScheduleRisk(...) per initiative  -> persist RiskScore rows
  │    velocity trend helper over snapshots   -> trend per team
  │    hitl.propose(...) x3                    -> PENDING proposals + audit rows
  └─ result: derived values are engine output, not fixtures

repository.ts (read side, server components call these)
  healthSummary · riskMatrix · velocityByTeam · initiativesWithForecast
  · pendingProposals · recentActivity

app/(dash)/layout.tsx  -> Sidebar shell
app/page.tsx           -> Overview (KPI strip, heatmap, velocity, initiatives, HITL inbox)
app/initiatives · app/risks · app/audit   -> real secondary list views
app/sprints · app/communications          -> light list views
```

### Velocity trend helper

Add `src/agents/risk/velocity.ts` — a pure function computing `VelocityTrend` (rising / stable / dropping) from an ordered list of `VelocitySnapshot` delivered points, plus `velocityPerSprint` for feeding `scoreScheduleRisk`. Kept pure and unit-tested, mirroring `scoring.ts`.

## HITL is live, not decorative

Approve / Reject in the inbox are Next **server actions** that call the existing `HitlGate`:

- **Approve:** `hitl.decide(id, true, user)`; if an effect is registered for the proposal kind, `hitl.apply(id)` runs it. Both paths write the audit trail via `recordAction`.
- **Reject:** `hitl.decide(id, false, user, reason)`.
- Page revalidates; the Audit log page reflects the new action.

This exercises the same gate the adversarial test pins — clicking Approve moves a real proposal `PENDING → APPROVED → APPLIED` and is visible in the audit trail.

## Components and boundaries

| Unit | Purpose | Depends on |
|------|---------|-----------|
| `app/tokens.css` | theme tokens | — |
| `ui/Sidebar` | nav shell + program switcher | tokens |
| `ui/Panel` `ui/KpiTile` `ui/Badge` `ui/ProgressBar` | layout primitives | tokens |
| `viz/RiskHeatmap` `viz/VelocityBars` `viz/HealthDial` | SVG/CSS visualizations | tokens, typed data props |
| `repository` read methods | query the program model for each panel | prisma |
| `agents/risk/velocity.ts` | pure velocity trend + per-sprint rate | — |
| seed | raw facts + engine run | scoring, velocity, hitl |
| server actions | approve/reject through the gate | HitlGate |

Each viz component is fed plain typed data and can be rendered/tested without a database.

## Testing

- Keep the existing 7 tests green.
- Unit-test `agents/risk/velocity.ts` (trend from snapshot series) alongside the existing `scoring.test.ts`.
- Unit-test repository shaping: `riskMatrix` produces the initiative × kind matrix; `velocityByTeam` aggregates correctly — run against the seeded DB.
- Unit-test viz pure helpers (severity→token color, matrix builder) with no DB.
- Seed determinism: engine-derived values stable across reseed.
- Verification: reseed, run dev server, curl `/`, `/initiatives`, `/risks`, `/audit` for HTTP 200 and expected content; exercise one Approve action and confirm the audit row appears.

## Definition of done

1. Overview renders the full Command Center on Tokyo Night tokens, populated from the seeded program.
2. Every KPI, heatmap cell, velocity trend, and forecast is produced by the engine (scoring/velocity) over seeded raw facts — not hand-written.
3. Approve/Reject move a real proposal through `HitlGate` and appear in the Audit log.
4. Initiatives, Risks, and Audit are real secondary views; Sprints and Communications are present as light views.
5. `lint`, `typecheck`, and `test` pass; new unit tests cover the velocity helper, repository shaping, and viz helpers.

## Follow-on (out of scope here)

Extract `app/tokens.css`, `src/components/ui/`, and `src/components/viz/` into a `dashboard` module under `setup-project/blueprint/templates/` so future blueprint scaffolds inherit the design system and viz kit. This is the "then extract" half of the sequencing decision and gets its own spec.
