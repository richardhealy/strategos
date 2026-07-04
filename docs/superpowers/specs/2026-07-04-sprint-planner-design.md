# Sprint Planner for a Kanban Workspace — Design

- **Date:** 2026-07-04
- **Status:** Approved (design)

## Problem

strategos assumes real projects, cycle-based execution, and timelines. The target
Linear workspace is a Kanban "camp board": many "projects" that are actually
backlogs/lists (noise), real work not organized into cycles, and no dates. As a
result the dashboard syncs junk as initiatives, `/sprints` is empty (no cycles →
no velocity), and there is no planning structure.

**Goal:** a planner that (1) scopes to the user's real projects, (2) organizes
their tickets into a rolling sprint cadence, and (3) writes that structure back
into Linear (cycles + dates) under human approval, learning capacity over time.

## Decisions (from brainstorming)

- **Output:** push sprints **into** Linear — create cycles, assign issues, set
  dates — via the existing HITL approval flow.
- **Scope:** opt-in via a native Linear **project label** (default `strategos`).
- **Shape:** ONE rolling cadence (default 2 weeks) across all managed projects.
  Confirmed **single Linear team** → one cycle sequence.
- **Capacity:** propose-and-learn — seeded default, HITL adjusts, learns from
  completed cycles.
- **Selection:** deterministic (priority → dependencies → age); the LLM writes
  only the rationale. (Approach A.)

## Non-goals (YAGNI)

- LLM-driven ticket selection (approaches B/C) — deferred; a clean seam is left.
- Multi-team synchronized cycles — documented as a future extension; v1 is one team.
- Per-project separate cadences.
- Setting initiative/project target dates — cycles provide the timeline.
- Points-based capacity as the primary path — count-based; points optional later.

## Configuration

| Var | Default | Purpose |
|-----|---------|---------|
| `STRATEGOS_SPRINT_LABEL` | `strategos` | Linear project label marking managed projects |
| `STRATEGOS_SPRINT_LENGTH_DAYS` | `14` | Sprint window length |
| `STRATEGOS_SPRINT_SEED_CAPACITY` | `8` | Cold-start capacity (ticket count) |
| `STRATEGOS_SPRINT_TEAM` | _(required)_ | Linear team key that hosts the cycle sequence |

Parsed in `src/config/sprint.ts`, following the existing `src/config/linear.ts`
pattern (throw a clear error if `STRATEGOS_SPRINT_TEAM` is unset when planning runs).

## Data model

- **Migration:** add `SPRINT_PLAN` to the `ProposalKind` enum.
- **Proposed sprint** lives in `HitlProposal` (`kind = SPRINT_PLAN`, `payload Json`):
  ```json
  {
    "index": 7,
    "startsAt": "2026-07-06T00:00:00.000Z",
    "endsAt": "2026-07-20T00:00:00.000Z",
    "capacityTarget": 8,
    "taskExternalIds": ["<linear-issue-id>", "..."],
    "rationale": "LLM-written explanation",
    "teamKey": "ENG"
  }
  ```
- **Applied sprint = a Linear Cycle**, created on approval and pulled back by sync.
  Completed cycles produce `VelocitySnapshot` (`committedPts`/count = planned,
  `completedPts`/count = done). `VelocitySnapshot` is both the velocity-chart
  source and the learn signal.
- **No new tables.**

## Components

Each component has one purpose and a well-defined interface.

### 1. Scope filter (sync)
- Extend `PROJECTS_QUERY` in `src/integrations/linear/pull.ts` with
  `labels(first: 10) { nodes { name } }` (cap kept small for the complexity budget).
- A project is **managed** iff its labels include `STRATEGOS_SPRINT_LABEL`.
- `pullProjects` / `pullMilestones` / `pullIssues` filter to managed projects;
  issues inherit scope via their project.
- **Effect:** unlabeled noise (Idea Backlog, Reading List, …) stops syncing as
  initiatives — fixes the de-noising problem directly.

### 2. Planning engine — `src/agents/sprint/plan.ts` (pure, no I/O)
- `selectCandidates(tasks)` → open tasks (`BACKLOG` / `PLANNED` / `IN_PROGRESS`)
  in managed projects, not already assigned to a cycle.
- `prioritize(candidates)` → stable sort by Linear priority (urgent first, none
  last) → dependency order (blockers before blocked) → age (older first).
- `proposeCapacity(completedHistory, seed)` → `seed` on cold start; else rolling
  average (last K=3) of completed counts; clamped to a sane min/max.
- `fillSprint(prioritized, capacity)` → take from the top to capacity, skipping a
  task whose blocker is neither `DONE` nor already included earlier.
- Returns `{ taskExternalIds, capacityTarget }`. Fully unit-testable.

### 3. Sprint agent — `src/agents/sprint/index.ts` (implements the `TODO(M3)` stub)
- `run(ctx)`: load managed candidates + completed history → run the engine → LLM
  writes the rationale (`complete()`) → compute the window → emit a `SPRINT_PLAN`
  `HitlProposal` (state `PENDING`). **No Linear writes here.**
- **Window:** `startsAt` = the cadence boundary the plan is generated on (the
  Monday of the `sprintCadence` cron, or "today" for an on-demand run);
  `endsAt` = `startsAt + STRATEGOS_SPRINT_LENGTH_DAYS`. If an active
  (non-completed) sprint already covers today, skip — one open sprint at a time.
- Guardrail: no managed projects or zero candidates → info log, no proposal.

### 4. Apply path (write-back) — `src/integrations/linear/write.ts` + HITL gate
- Add `createCycle({ teamId, name, startsAt, endsAt })` → `cycleId`, and
  `assignIssueToCycle(issueId, cycleId)` via `updateIssue(id, { cycleId })`.
- On an `APPROVED` `SPRINT_PLAN`, the gate routes a sprint-apply effect: resolve
  `teamId` from `teamKey` → `createCycle` ("Sprint {index}", window) → assign each
  `taskExternalId` → record `ActionLog`, set proposal `APPLIED` (or `FAILED` with
  reason). **Idempotent:** skip issues already on the cycle; reuse an existing
  cycle for the same window.

### 5. Dashboard — `app/(dash)/sprints/page.tsx`
- Add a **CurrentSprint** panel above `VelocityBars`: window, `capacityTarget`
  vs selected count, ticket list (title / priority / assignee), rationale, and
  proposal state. Data via a new `programModel.currentSprint(programId)` reading
  the latest `SPRINT_PLAN` proposal (and the synced cycle once applied).
- The proposal also appears in the existing approvals inbox.

## Data flow

1. `sprintCadence` cron (or on-demand) → `sprintAgent.run`.
2. Engine selects + prioritizes + fills → payload; LLM adds rationale.
3. `SPRINT_PLAN` `HitlProposal` (`PENDING`) → approvals inbox + `/sprints`.
4. User approves/adjusts → gate applies effects → Linear cycle created, issues assigned.
5. Next sync pulls the cycle; on completion a `VelocitySnapshot` is recorded.
6. `proposeCapacity` uses the completed history next cadence (learn).

## Error handling

- **Cycles disabled on the team** → `createCycle` errors → proposal `FAILED` with
  an actionable reason ("enable Cycles on team X"); sync is unaffected.
- **Missing label / no managed projects** → no proposal (info log, not an error).
- **Partial apply** → per-issue `ActionLog`; re-apply is safe (idempotent).
- **LLM rationale failure** → proposal still emitted with a fallback rationale
  (planning is deterministic; the rationale is cosmetic).

## Testing

- Pure engine functions — unit tests incl. dependency ordering, cold-start seed
  vs rolling average, capacity clamps, and skip-blocked-task.
- Scope label filter — unit test managed vs unmanaged.
- `write.ts` cycle mutations — mocked-SDK tests (pattern from
  `linear.pull.test.ts` / `linear.write.test.ts`).
- Agent proposal emission — given candidates (LLM mocked), asserts a valid payload
  and a `PENDING` proposal.
- Not unit-tested: live Linear writes (manual verification), LLM rationale content.

## Build order (phased)

1. **Scope filter** (label opt-in) — de-noises the dashboard, zero write risk.
2. **Planning engine + agent + proposal + dashboard read** — proposals visible,
   still zero Linear writes.
3. **Write-back** (cycle create/assign via HITL) — touches real Linear, last and
   behind approvals.
4. **Learn loop** — capacity from completed cycles.

## Future extensions (seams)

- Multi-team synchronized cycles (one cycle per involved team, same window).
- Points-based capacity once tickets are estimated.
- LLM re-ranking within the deterministic shortlist (approach C).
