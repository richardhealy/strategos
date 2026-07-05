# Agent-Mode Planner (dual-mode: Human | AI) — Design

- **Date:** 2026-07-05
- **Status:** Approved (design)

## Problem

strategos plans work as **human sprints** — capacity-bounded, fortnightly, velocity-learned. Some of the user's projects are developed by **AI coding agents**, where that model doesn't fit: capacity is effectively free and parallel, tickets are ad-hoc, and the scarce resources are **readiness** (is a ticket spec'd well enough to hand to an agent?), **correct sequencing**, and **human review**. This design adds a second project mode — **AI** — with an agent-oriented planning "brain," alongside the existing human sprint planner.

## Positioning (decides scope)

The user has a full agent-ops ecosystem already. strategos stays the **planning/PM brain**, not the control plane:

- **strategos (AI mode)** = readiness classification + **precedence** sequencing + a **dispatch-plan proposal** + a flow dashboard + HITL. It answers *"what's ready, in what order, and is it worth doing."*
- **Hands off** (later slices) to **conductor** (run a ticket → PR), **harbormaster** (impact-aware scheduling, merge queue, release), which use **spelunk** (code impact), **abacus** (cost), **watchtower** (KPIs), **assay** (quality gate).

Two different graphs, two different owners:

| Graph | Meaning | Owner | Source |
|---|---|---|---|
| **Precedence** | "do the schema ticket before the feature ticket" | **strategos (this design)** | declared Linear `blocked-by` |
| **Impact/conflict** | "these two edit the same files" | **harbormaster** | spelunk |

## Decisions (from brainstorming)

- **Dual-mode is per-project.** A Linear project = an `Initiative`; add `Initiative.mode: HUMAN | AI`. Default HUMAN; an **`agent`** Linear project label → AI. Sync sets it. HUMAN routes to the existing sprint planner; AI routes to the new wave planner.
- **First slice = the brain only.** Readiness + precedence waves + dispatch-plan proposal + flow dashboard. **Read-only — no Linear writes, no execution.**
- **Waves = precedence from declared `blocked-by`**, not code impact (that's harbormaster/spelunk). If a project has few declared deps, waves degrade to a flat ready-queue — acceptable.
- **Oversized tickets are flagged, not split.** Readiness `NEEDS_SPEC` with a suggested split in the rationale; no auto-created subtasks (that's a write; deferred).
- **Mode-aware `/sprints` route**, not a separate `/flow` route — one place, renders by initiative mode.

## Non-goals (YAGNI / deferred)

- Executing tickets (conductor / Claude Code) · impact-aware scheduling, merge queue, release (harbormaster) · spelunk integration · cost (abacus) · monitoring KPIs (watchtower) · quality gates (assay).
- Auto-decomposition that **writes** subtasks to Linear.
- Delivery KPIs that need runtime data (first-pass success, cost/ticket, cycle time).

## Configuration

| Var | Default | Purpose |
|-----|---------|---------|
| `STRATEGOS_AGENT_LABEL` | `agent` | Linear project label that puts an initiative in AI mode |
| `STRATEGOS_READINESS_BATCH` | `20` | Tickets per readiness-classifier LLM call (cost control) |

## Data model

- `enum ProjectMode { HUMAN AI }`; `Initiative.mode ProjectMode @default(HUMAN)`.
- `enum ReadinessStatus { READY NEEDS_SPEC BLOCKED }`.
- `Task` gains: `description String?`, `readiness ReadinessStatus?`, `readinessReason String?`, `readinessAt DateTime?`.
- `model TaskDependency { id, blockedTaskId, blockerTaskId }` — task-level precedence edges (today `Dependency` is epic-level only). Unique on `(blockedTaskId, blockerTaskId)`.
- `enum ProposalKind` += `DISPATCH_PLAN`.
- Dispatch plan lives in `HitlProposal.payload` (`kind = DISPATCH_PLAN`):
  ```json
  {
    "initiativeExternalId": "<linear-project-id>",
    "waves": [ ["<ticketId>", "..."], ["<ticketId>"] ],
    "readiness": { "ready": 12, "needs_spec": 5, "blocked": 3 },
    "rationale": "LLM-written"
  }
  ```

## Components

Each has one responsibility and a testable boundary.

### 1. Mode plumbing & sync
- `RawInitiative.mode?: "HUMAN" | "AI"`; `pullProjects` sets AI when the project carries `STRATEGOS_AGENT_LABEL`, else HUMAN. `syncEngine` persists `Initiative.mode`.
- `pullIssues` also pulls the issue **`description`** and its **`blocked-by` relations** (Linear `issue.relations` of type `blocks`/`blocked_by`). `syncEngine` upserts `Task.description` and reconciles `TaskDependency` edges (resolve related issue ids via `ExternalRef`).

### 2. Readiness classifier — `src/agents/agentplan/readiness.ts` (LLM, batched, cached)
- Input: candidate tasks (open, in an AI initiative) whose `readinessAt` is older than `updatedAt` (only (re)classify changed tickets — **cost control**, critical at RollQuest's ~400 open).
- Batches of `STRATEGOS_READINESS_BATCH` → one LLM call returning, per ticket: `{ status: READY|NEEDS_SPEC|BLOCKED, reason }`. "READY" = clear goal + acceptance criteria + scoped for one agent; "NEEDS_SPEC" = too vague/large (reason suggests a split); "BLOCKED" = depends on unfinished work or an external decision.
- Persists `readiness`, `readinessReason`, `readinessAt` on each Task. Pure parsing/validation split out for unit tests; the network call is thin.

### 3. Wave engine — `src/agents/agentplan/waves.ts` (pure, no I/O)
- `buildGraph(tasks, edges)` → nodes (READY tasks) + precedence edges (drop edges to non-ready/blocker-done).
- `topologicalWaves(graph)` → `string[][]` layers: wave 0 = no unmet blocker; wave N unlocks after N-1. **Cycle guard**: detect a cycle, break it deterministically, and surface it in the rationale rather than hanging.
- `orderByLeverage(wave, graph)` → within a wave, descending fan-out (unblocks the most downstream work first).

### 4. Agent planner + proposal — `src/agents/agentplan/index.ts`
- Per AI initiative: load candidates → run readiness → take READY → build precedence graph → waves → leverage-order → LLM rationale → emit a `DISPATCH_PLAN` `HitlProposal` (PENDING). No Linear writes. Guardrail: no ready tickets → info log, no proposal.

### 5. Mode router — `src/agents/planRouter.ts`
Modes plan at different granularities, so the router is not a naive per-initiative loop:
- **HUMAN** → **one** program-level sprint across all HUMAN managed initiatives (the existing sprint agent). Requires a one-line change: `candidateTasksForSprint` filters `mode: "HUMAN"` so AI initiatives are **not** pulled into a human sprint.
- **AI** → **per-initiative** dispatch plan (the new agent planner), one `DISPATCH_PLAN` proposal per AI initiative.
- Called by the `sprintCadence` cron and the `db:plan` one-shot: run the sprint agent once, then the agent planner for each AI initiative.

### 6. Flow dashboard — mode-aware `/sprints`
- HUMAN initiatives render the current sprint panel (unchanged). AI initiatives render a **flow board**: readiness breakdown (Ready · Needs-spec · Blocked counts), the proposed **waves** (ticket lists per wave), and the rationale. Data via `programModel.agentPlan(initiativeId)` + `readinessBreakdown(initiativeId)`.

## Data flow

1. Sync sets `Initiative.mode` from the `agent` label; pulls task `description` + `blocked-by` edges.
2. `db:plan` / cron → router → for AI initiatives, the agent planner runs.
3. Readiness classifier labels changed tickets (batched, cached).
4. Wave engine builds precedence waves over READY tickets, leverage-ordered.
5. `DISPATCH_PLAN` proposal (PENDING) → approvals inbox + flow board.
6. (Later slice) approval hands the ordered ready set to harbormaster/conductor.

## Reuse (honest)

This slice is planning logic + one LLM call, so **direct reuse is light**: optionally wrap the readiness call in **bulwark** (resilience) — small, nice-to-have; otherwise the existing `@/llm/client`. The heavy reuse — **conductor** (execute), **harbormaster** (schedule/merge/release), **abacus** (cost), **watchtower** (KPIs), **spelunk** (impact), **assay** (gate) — all lands in the **execution slices after this**, because they need dispatch/runtime data that does not exist yet. `keystone` is the reference for how those compose.

## KPIs (planning-side only in v1)

Delivery KPIs (first-pass success, cost/ticket, cycle time) need execution data → deferred to the conductor/watchtower/abacus slices. v1 shows: **readiness ratio** (% open backlog READY), **blocked ratio**, and **available parallelism** (wave count / widest wave). The rest are labelled "unlocks with execution."

## Error handling

- No `agent`-labelled projects → nothing runs in AI mode (info log).
- No `blocked-by` edges → single flat wave (correct, not an error).
- Dependency cycle → broken deterministically + flagged in rationale; never hangs.
- Readiness LLM failure on a batch → that batch stays unclassified (retried next run); planning proceeds with what's classified; never crashes sync.

## Testing

- Wave engine (`buildGraph`, `topologicalWaves`, `orderByLeverage`, cycle guard) — thorough pure unit tests incl. diamond deps, cycles, flat (no edges), leverage ties.
- Readiness parsing — mocked-LLM test: a batch response maps to per-ticket statuses; malformed entries are skipped, not fatal.
- Sync enrichment — mocked-SDK test: description + blocked-by edges land; mode set from label.
- Planner — mocked deps: emits a `DISPATCH_PLAN` with correct waves given candidates + readiness.
- Dashboard — runtime smoke (boot, hit `/sprints` for an AI initiative).

## Build order (phased — likely two plans)

1. **Enrichment + mode** — `ProjectMode`, `agent` label → mode, sync `description` + `TaskDependency`, migration. De-risks the data layer.
2. **Readiness + waves + proposal + dashboard** — classifier, wave engine, planner, `DISPATCH_PLAN`, flow board.

## Future slices (separate specs)

- **Execution handoff:** approve `DISPATCH_PLAN` → hand ready waves to **conductor** (ticket→PR) and **harbormaster** (impact scheduling, merge queue, release). Real reuse begins here.
- **Cost + monitoring:** **abacus** budgets per ticket, **watchtower** delivery KPIs.
- **Auto-grooming:** `plannerAgent`-powered decomposition of `NEEDS_SPEC` tickets into agent-sized subtasks (with HITL writes).
