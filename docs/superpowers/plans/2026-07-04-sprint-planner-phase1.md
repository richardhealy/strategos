# Sprint Planner (Phases 1–2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** De-noise the dashboard to only user-labeled Linear projects and generate a deterministic, HITL-approvable sprint proposal from the Kanban backlog — with no writes to Linear yet.

**Architecture:** A native Linear project **label** marks managed projects; sync flags each initiative `managed`. A pure planning engine selects/prioritizes/fills a sprint from open tasks; the sprint agent wraps it, adds an LLM rationale, and emits a `SPRINT_PLAN` HITL proposal. The dashboard shows the current proposal. Approval → applying to Linear is **Phase 3** (a separate plan).

**Tech Stack:** Next.js 15, Prisma 6 / Postgres (Neon), `@linear/sdk`, Inngest, `@anthropic-ai/sdk`, Vitest, TypeScript (ESM).

## Global Constraints

- Node `>=20`; ESM (`"type": "module"`); path alias `@/*` → `src/*`.
- No `any` — the repo lints with `typescript-eslint`; keep types explicit.
- Tests use Vitest; mock the Linear SDK via `vi.hoisted` + `vi.mock("@/integrations/linear/client")` (pattern in `tests/linear.pull.test.ts`).
- New config vars (verbatim): `STRATEGOS_SPRINT_LABEL` (default `strategos`), `STRATEGOS_SPRINT_LENGTH_DAYS` (default `14`), `STRATEGOS_SPRINT_SEED_CAPACITY` (default `8`), `STRATEGOS_SPRINT_TEAM` (required only at write-time; Phase 1 does not need it).
- Single Linear team (v1). No writes to Linear in this plan.
- Commit messages end with: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

## Refinements vs. the design spec (discovered during planning)

1. **De-noise via a `managed` flag, not a hard sync filter.** Filtering junk out of the pull would orphan already-synced junk rows. Instead sync every project but set `Initiative.managed = (project has the label)`; reads filter `managed: true`. Self-healing: existing junk flips to `managed: false` on the next sync.
2. **Dependency ordering is deferred.** Dependencies in the model are epic-level (`model Dependency`) and are **not populated by sync**, so any task dependency logic would be dead code on real data. v1 `prioritize` sorts by **Linear priority → age**. (Left as a Plan-2/future seam.)
3. **"Not already in a cycle" → "not in the active sprint proposal."** The `Task` model has no cycle membership, so the engine excludes tasks already in the latest open `SPRINT_PLAN` proposal.

---

### Task 1: Sprint config module

**Files:**
- Create: `src/config/sprint.ts`
- Test: `tests/sprint.config.test.ts`

**Interfaces:**
- Produces: `sprintConfig(): { label: string; lengthDays: number; seedCapacity: number; team: string | null }` and `parseSprintConfig(env: Record<string, string | undefined>): SprintConfig`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/sprint.config.test.ts
import { describe, it, expect } from "vitest";
import { parseSprintConfig } from "@/config/sprint";

describe("parseSprintConfig", () => {
  it("applies defaults when env is empty", () => {
    const c = parseSprintConfig({});
    expect(c).toEqual({ label: "strategos", lengthDays: 14, seedCapacity: 8, team: null });
  });
  it("reads overrides", () => {
    const c = parseSprintConfig({
      STRATEGOS_SPRINT_LABEL: "sprintable",
      STRATEGOS_SPRINT_LENGTH_DAYS: "7",
      STRATEGOS_SPRINT_SEED_CAPACITY: "5",
      STRATEGOS_SPRINT_TEAM: "ENG",
    });
    expect(c).toEqual({ label: "sprintable", lengthDays: 7, seedCapacity: 5, team: "ENG" });
  });
  it("ignores non-numeric length/capacity and uses defaults", () => {
    const c = parseSprintConfig({ STRATEGOS_SPRINT_LENGTH_DAYS: "abc" });
    expect(c.lengthDays).toBe(14);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sprint.config.test.ts`
Expected: FAIL — `Cannot find module '@/config/sprint'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/config/sprint.ts
export interface SprintConfig {
  label: string;
  lengthDays: number;
  seedCapacity: number;
  team: string | null;
}

function int(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export function parseSprintConfig(env: Record<string, string | undefined>): SprintConfig {
  return {
    label: env.STRATEGOS_SPRINT_LABEL?.trim() || "strategos",
    lengthDays: int(env.STRATEGOS_SPRINT_LENGTH_DAYS, 14),
    seedCapacity: int(env.STRATEGOS_SPRINT_SEED_CAPACITY, 8),
    team: env.STRATEGOS_SPRINT_TEAM?.trim() || null,
  };
}

export function sprintConfig(): SprintConfig {
  return parseSprintConfig(process.env);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sprint.config.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Update `.env.example`**

Add under a new `# ---- Sprint planner ----` section:
```
STRATEGOS_SPRINT_LABEL=strategos
STRATEGOS_SPRINT_LENGTH_DAYS=14
STRATEGOS_SPRINT_SEED_CAPACITY=8
STRATEGOS_SPRINT_TEAM=
```

- [ ] **Step 6: Commit**

```bash
git add src/config/sprint.ts tests/sprint.config.test.ts .env.example
git commit -m "feat(sprint): sprint planner config module"
```

---

### Task 2: Schema — `managed`, task `priority`, `SPRINT_PLAN` proposal kind

**Files:**
- Modify: `prisma/schema.prisma` (Initiative, Task, ProposalKind)
- Generated: `prisma/migrations/<timestamp>_sprint_planner_fields/`

**Interfaces:**
- Produces: `Initiative.managed: Boolean` (default false), `Task.priority: Int?`, `ProposalKind.SPRINT_PLAN`.

- [ ] **Step 1: Edit the schema**

In `model Initiative`, add after `status`:
```prisma
  managed     Boolean      @default(false)
```
In `model Task`, add after `estimatePoints`:
```prisma
  priority       Int?
```
In `enum ProposalKind`, add:
```prisma
  SPRINT_PLAN   // propose a sprint (cycle) plan
```

- [ ] **Step 2: Create + apply the migration (also regenerates the client)**

Run (uses the `DATABASE_URL`/`DIRECT_URL` in your `.env` — this is your Neon dev DB):
```bash
npx prisma migrate dev --name sprint_planner_fields
```
Expected: "The following migration(s) have been applied" and "Generated Prisma Client".

- [ ] **Step 3: Verify typecheck still green**

Run: `npm run typecheck`
Expected: no output (pass) — the new optional fields don't break existing code.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(sprint): schema — managed initiatives, task priority, SPRINT_PLAN kind"
```

---

### Task 3: Sync — carry `managed` (from label) and task `priority` into the model

**Files:**
- Modify: `src/integrations/types.ts` (RawInitiative, RawTask)
- Modify: `src/integrations/linear/map.ts` (LinearProject, LinearIssue already carry the data; mapProject/mapIssue pass it through)
- Modify: `src/integrations/linear/pull.ts` (PROJECTS_QUERY labels; pullProjects computes `managed`)
- Modify: `src/state/sync/syncEngine.ts` (set `managed` on initiative, `priority` on task — create AND update)
- Test: `tests/linear.pull.test.ts` (extend), `tests/linear.map.test.ts` (extend)

**Interfaces:**
- Consumes: `sprintConfig().label` (Task 1).
- Produces: `RawInitiative.managed?: boolean`, `RawTask.priority?: number`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/linear.pull.test.ts`:
```ts
import { pullProjects } from "@/integrations/linear/pull";

describe("pullProjects managed flag", () => {
  beforeEach(() => rawRequest.mockReset());
  it("marks a project managed only if it carries the configured label", async () => {
    rawRequest.mockResolvedValueOnce({
      data: { projects: { nodes: [
        { id: "p1", name: "Real", targetDate: null, state: "started", lead: null,
          teams: { nodes: [{ key: "ENG" }] }, projectMilestones: { nodes: [] },
          labels: { nodes: [{ name: "strategos" }] } },
        { id: "p2", name: "Junk", targetDate: null, state: null, lead: null,
          teams: { nodes: [{ key: "ENG" }] }, projectMilestones: { nodes: [] },
          labels: { nodes: [{ name: "misc" }] } },
      ], pageInfo: { hasNextPage: false, endCursor: null } } },
    });
    const inits = await pullProjects([]);
    expect(inits.find((i) => i.externalId === "p1")?.managed).toBe(true);
    expect(inits.find((i) => i.externalId === "p2")?.managed).toBe(false);
  });
});
```

Add to `tests/linear.map.test.ts`:
```ts
import { mapIssue } from "@/integrations/linear/map";
it("carries Linear priority onto the task", () => {
  const t = mapIssue({ id: "i1", title: "x", projectId: "p1", stateType: "started", priority: 2 });
  expect(t.priority).toBe(2);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/linear.pull.test.ts tests/linear.map.test.ts`
Expected: FAIL — `managed` is `undefined` and `mapIssue` output has no `priority`.

- [ ] **Step 3: Add fields to Raw types**

In `src/integrations/types.ts`, add to `RawInitiative`:
```ts
  managed?: boolean;
```
and to `RawTask`:
```ts
  priority?: number;
```

- [ ] **Step 4: Pass the data through the mappers**

In `src/integrations/linear/map.ts`:
- Add `managed?: boolean` to `interface LinearProject`.
- In `mapProject`, add `managed: p.managed ?? false` to the returned object.
- In `mapIssue`, add `priority: i.priority` to the returned object.

- [ ] **Step 5: Fetch labels and compute `managed` in `pull.ts`**

In `src/integrations/linear/pull.ts`:
- Import config at top: `import { sprintConfig } from "@/config/sprint";`
- Add `labels(first: 10) { nodes { name } }` to `PROJECTS_QUERY`'s project `nodes`.
- Add to `interface ProjectNode`: `labels: { nodes: { name: string }[] };`
- In `pullProjects`, when pushing the raw project, compute managed:
```ts
    const label = sprintConfig().label;
    const managed = p.labels.nodes.some((l) => l.name === label);
    raw.push({ id: p.id, name: p.name, leadName: p.lead?.name, targetDate: p.targetDate ?? undefined, state: p.state ?? undefined, managed });
```
- Add `managed?: boolean` to `interface LinearProject` reference already handled in map.ts (Step 4); the object pushed here must include `managed`.

- [ ] **Step 6: Persist `managed` and `priority` in `syncEngine.ts`**

In `src/state/sync/syncEngine.ts`, in the Initiatives `upsertByRef` block:
- `create`: add `managed: raw.managed ?? false` to the `data`.
- `update`: add `managed: raw.managed ?? false` to the `data`.

In the Tasks `upsertByRef` block:
- `create`: add `priority: raw.priority ?? null` to the `data`.
- `update`: add `priority: raw.priority ?? null` to the `data`.

- [ ] **Step 7: Run tests + typecheck**

Run: `npx vitest run && npm run typecheck`
Expected: all tests PASS; typecheck clean.

- [ ] **Step 8: Commit**

```bash
git add src/integrations/types.ts src/integrations/linear/map.ts src/integrations/linear/pull.ts src/state/sync/syncEngine.ts tests/linear.pull.test.ts tests/linear.map.test.ts
git commit -m "feat(sprint): sync project label -> managed flag and task priority"
```

---

### Task 4: Planning engine (pure)

**Files:**
- Create: `src/agents/sprint/plan.ts`
- Test: `tests/sprint.plan.test.ts`

**Interfaces:**
- Produces:
  - `interface CandidateTask { externalId: string; title: string; priority: number | null; createdAt: Date; status: string }`
  - `selectCandidates(tasks: CandidateTask[], activeExternalIds: string[]): CandidateTask[]`
  - `prioritize(tasks: CandidateTask[]): CandidateTask[]`
  - `proposeCapacity(completedCounts: number[], seed: number): number`
  - `interface SprintSelection { taskExternalIds: string[]; capacityTarget: number }`
  - `fillSprint(prioritized: CandidateTask[], capacity: number): SprintSelection`
  - `sprintWindow(lengthDays: number, now: Date): { startsAt: string; endsAt: string }`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/sprint.plan.test.ts
import { describe, it, expect } from "vitest";
import {
  selectCandidates, prioritize, proposeCapacity, fillSprint, sprintWindow,
  type CandidateTask,
} from "@/agents/sprint/plan";

const t = (o: Partial<CandidateTask> & { externalId: string }): CandidateTask => ({
  title: o.externalId, priority: null, createdAt: new Date("2026-01-01"), status: "BACKLOG", ...o,
});

describe("selectCandidates", () => {
  it("keeps open tasks and drops done/active-sprint ones", () => {
    const tasks = [t({ externalId: "a" }), t({ externalId: "b", status: "DONE" }), t({ externalId: "c" })];
    const out = selectCandidates(tasks, ["c"]);
    expect(out.map((x) => x.externalId)).toEqual(["a"]);
  });
});

describe("prioritize", () => {
  it("orders urgent(1) first, none(0/null) last, then oldest first", () => {
    const tasks = [
      t({ externalId: "none", priority: 0, createdAt: new Date("2026-01-01") }),
      t({ externalId: "urgent", priority: 1, createdAt: new Date("2026-02-01") }),
      t({ externalId: "low", priority: 4, createdAt: new Date("2026-01-05") }),
      t({ externalId: "oldNull", priority: null, createdAt: new Date("2025-01-01") }),
    ];
    expect(prioritize(tasks).map((x) => x.externalId)).toEqual(["urgent", "low", "oldNull", "none"]);
  });
});

describe("proposeCapacity", () => {
  it("returns the seed on cold start", () => {
    expect(proposeCapacity([], 8)).toBe(8);
  });
  it("rounds the average of the last 3 completed counts", () => {
    expect(proposeCapacity([2, 10, 6, 5, 7], 8)).toBe(6); // avg(6,5,7)=6
  });
  it("never proposes below 1", () => {
    expect(proposeCapacity([0, 0], 8)).toBe(1);
  });
});

describe("fillSprint", () => {
  it("takes the top N up to capacity", () => {
    const tasks = [t({ externalId: "a" }), t({ externalId: "b" }), t({ externalId: "c" })];
    expect(fillSprint(tasks, 2)).toEqual({ taskExternalIds: ["a", "b"], capacityTarget: 2 });
  });
});

describe("sprintWindow", () => {
  it("spans lengthDays from midnight of now", () => {
    const w = sprintWindow(14, new Date("2026-07-04T09:30:00Z"));
    expect(w.startsAt).toBe("2026-07-04T00:00:00.000Z");
    expect(w.endsAt).toBe("2026-07-18T00:00:00.000Z");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/sprint.plan.test.ts`
Expected: FAIL — `Cannot find module '@/agents/sprint/plan'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/agents/sprint/plan.ts
export interface CandidateTask {
  externalId: string;
  title: string;
  priority: number | null;
  createdAt: Date;
  status: string;
}

export interface SprintSelection {
  taskExternalIds: string[];
  capacityTarget: number;
}

const OPEN_STATUSES = new Set(["BACKLOG", "PLANNED", "IN_PROGRESS", "IN_REVIEW", "BLOCKED"]);

// Exclude done work and anything already in the active sprint proposal.
export function selectCandidates(tasks: CandidateTask[], activeExternalIds: string[]): CandidateTask[] {
  const active = new Set(activeExternalIds);
  return tasks.filter((t) => OPEN_STATUSES.has(t.status) && !active.has(t.externalId));
}

// Linear priority: 1=Urgent … 4=Low, 0/none = no priority. Urgent first, none last.
function rank(p: number | null): number {
  return p == null || p === 0 ? 5 : p;
}

export function prioritize(tasks: CandidateTask[]): CandidateTask[] {
  return [...tasks].sort(
    (a, b) => rank(a.priority) - rank(b.priority) || a.createdAt.getTime() - b.createdAt.getTime(),
  );
}

// Cold start: seed. Else the rounded mean of the last 3 completed counts, floored at 1.
export function proposeCapacity(completedCounts: number[], seed: number): number {
  if (completedCounts.length === 0) return seed;
  const recent = completedCounts.slice(-3);
  const avg = recent.reduce((s, n) => s + n, 0) / recent.length;
  return Math.max(1, Math.round(avg));
}

export function fillSprint(prioritized: CandidateTask[], capacity: number): SprintSelection {
  const chosen = prioritized.slice(0, Math.max(0, capacity));
  return { taskExternalIds: chosen.map((t) => t.externalId), capacityTarget: capacity };
}

// Window starts at midnight of `now` (the cron fires Monday, so cron runs align
// to Monday; on-demand runs start today) and spans lengthDays.
export function sprintWindow(lengthDays: number, now: Date): { startsAt: string; endsAt: string } {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + lengthDays);
  return { startsAt: start.toISOString(), endsAt: end.toISOString() };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/sprint.plan.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add src/agents/sprint/plan.ts tests/sprint.plan.test.ts
git commit -m "feat(sprint): deterministic planning engine"
```

---

### Task 5: Repository reads for sprint planning + dashboard

**Files:**
- Modify: `src/state/model/repository.ts`
- Test: `tests/sprint.repository.test.ts`

**Interfaces:**
- Consumes: `CandidateTask` (Task 4).
- Produces on `programModel`:
  - `candidateTasksForSprint(programId: string): Promise<CandidateTask[]>`
  - `activeSprintTaskIds(now: Date): Promise<string[]>`
  - `completedSprintCounts(programId: string): Promise<number[]>`
  - `sprintCount(): Promise<number>`
  - `currentSprint(): Promise<CurrentSprint | null>` where
    `interface CurrentSprint { index: number; startsAt: string; endsAt: string; capacityTarget: number; count: number; state: string; rationale: string; tickets: { externalId: string; title: string; priority: number | null; assignee: string | null }[] }`

Note: `HitlProposal` has no `programId` column, so sprint-proposal reads are global (fine for a single program). The `now` parameter keeps window checks testable.

- [ ] **Step 1: Write the failing test (pure payload-shaping helper)**

The DB methods are integration-shaped; unit-test the one piece of logic worth isolating — "is this proposal's window still open" — by extracting it as an exported pure helper.

```ts
// tests/sprint.repository.test.ts
import { describe, it, expect } from "vitest";
import { isSprintOpen } from "@/state/model/repository";

describe("isSprintOpen", () => {
  it("open when endsAt is in the future", () => {
    expect(isSprintOpen("2026-07-20T00:00:00.000Z", new Date("2026-07-10"))).toBe(true);
  });
  it("closed when endsAt has passed", () => {
    expect(isSprintOpen("2026-07-01T00:00:00.000Z", new Date("2026-07-10"))).toBe(false);
  });
  it("closed when endsAt missing", () => {
    expect(isSprintOpen(undefined, new Date("2026-07-10"))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sprint.repository.test.ts`
Expected: FAIL — `isSprintOpen` is not exported.

- [ ] **Step 3: Implement the helper + repository methods**

Add near the top of `src/state/model/repository.ts` (after imports):
```ts
import type { CandidateTask } from "@/agents/sprint/plan";

export interface SprintTicket { externalId: string; title: string; priority: number | null; assignee: string | null }
export interface CurrentSprint {
  index: number; startsAt: string; endsAt: string; capacityTarget: number;
  count: number; state: string; rationale: string; tickets: SprintTicket[];
}
interface SprintPayload {
  index?: number; startsAt?: string; endsAt?: string; capacityTarget?: number;
  taskExternalIds?: string[]; rationale?: string;
}

export function isSprintOpen(endsAt: string | undefined, now: Date): boolean {
  return !!endsAt && new Date(endsAt).getTime() > now.getTime();
}
```

Add these methods inside the `programModel` object:
```ts
  async candidateTasksForSprint(programId: string): Promise<CandidateTask[]> {
    const inits = await db.initiative.findMany({
      where: { programId, managed: true },
      include: { epics: { include: { tasks: { include: { source: true } } } } },
    });
    const out: CandidateTask[] = [];
    for (const i of inits) {
      for (const e of i.epics) {
        for (const t of e.tasks) {
          if (!t.source) continue; // need the Linear issue id to plan/assign
          out.push({
            externalId: t.source.externalId,
            title: t.title,
            priority: t.priority,
            createdAt: t.createdAt,
            status: t.status,
          });
        }
      }
    }
    return out;
  },

  async activeSprintTaskIds(now: Date): Promise<string[]> {
    const p = await db.hitlProposal.findFirst({
      where: { kind: "SPRINT_PLAN", state: { in: ["PENDING", "APPROVED", "APPLIED"] } },
      orderBy: { createdAt: "desc" },
    });
    if (!p) return [];
    const payload = p.payload as SprintPayload;
    if (!isSprintOpen(payload.endsAt, now)) return [];
    return payload.taskExternalIds ?? [];
  },

  async completedSprintCounts(programId: string): Promise<number[]> {
    const teams = await db.team.findMany({
      where: { programId },
      include: { velocitySnapshots: { orderBy: { periodStart: "asc" }, select: { completedPts: true } } },
    });
    return teams.flatMap((t) => t.velocitySnapshots.map((s) => s.completedPts));
  },

  async sprintCount(): Promise<number> {
    return db.hitlProposal.count({ where: { kind: "SPRINT_PLAN" } });
  },

  async currentSprint(): Promise<CurrentSprint | null> {
    const p = await db.hitlProposal.findFirst({ where: { kind: "SPRINT_PLAN" }, orderBy: { createdAt: "desc" } });
    if (!p) return null;
    const payload = p.payload as SprintPayload;
    const ids = payload.taskExternalIds ?? [];
    const refs = ids.length
      ? await db.externalRef.findMany({
          where: { externalId: { in: ids }, taskId: { not: null } },
          select: { externalId: true, task: { select: { title: true, priority: true, assignee: true } } },
        })
      : [];
    const byId = new Map(refs.map((r) => [r.externalId, r.task]));
    const tickets: SprintTicket[] = ids.map((id) => ({
      externalId: id,
      title: byId.get(id)?.title ?? id,
      priority: byId.get(id)?.priority ?? null,
      assignee: byId.get(id)?.assignee ?? null,
    }));
    return {
      index: payload.index ?? 1,
      startsAt: payload.startsAt ?? "",
      endsAt: payload.endsAt ?? "",
      capacityTarget: payload.capacityTarget ?? ids.length,
      count: ids.length,
      state: p.state,
      rationale: payload.rationale ?? "",
      tickets,
    };
  },
```

- [ ] **Step 4: Run test + typecheck**

Run: `npx vitest run tests/sprint.repository.test.ts && npm run typecheck`
Expected: PASS; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/state/model/repository.ts tests/sprint.repository.test.ts
git commit -m "feat(sprint): repository reads for candidates, active sprint, current sprint"
```

---

### Task 6: Sprint agent — build the proposal

**Files:**
- Modify: `src/agents/sprint/index.ts` (replace the stub body)
- Create: `src/agents/sprint/rationale.ts` (LLM call, isolated for a clean try/catch)
- Modify: `src/schedule/routines/sprintCadence.ts` (pass the real primary program id)
- Test: `tests/sprint.agent.test.ts`

**Interfaces:**
- Consumes: engine (Task 4), `programModel` reads (Task 5), `sprintConfig` (Task 1), `hitl.propose` (`src/hitl/gate.ts`), `complete` (`src/llm/client.ts`).
- Produces: `sprintAgent.run(ctx)` emits a `SPRINT_PLAN` proposal and returns `{ planned: number; blockers: number }`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/sprint.agent.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const { propose, candidateTasksForSprint, activeSprintTaskIds, completedSprintCounts, sprintCount } = vi.hoisted(() => ({
  propose: vi.fn(async () => "prop-1"),
  candidateTasksForSprint: vi.fn(),
  activeSprintTaskIds: vi.fn(async () => [] as string[]),
  completedSprintCounts: vi.fn(async () => [] as number[]),
  sprintCount: vi.fn(async () => 0),
}));

vi.mock("@/hitl/gate", () => ({ hitl: { propose } }));
vi.mock("@/state/model/repository", () => ({
  programModel: { candidateTasksForSprint, activeSprintTaskIds, completedSprintCounts, sprintCount },
}));
vi.mock("@/agents/sprint/rationale", () => ({ sprintRationale: vi.fn(async () => "because") }));

import { sprintAgent } from "@/agents/sprint";
import { log } from "@/logger";

const ctx = { programId: "prog-1", logger: log.child({ t: "test" }) };

describe("sprintAgent", () => {
  beforeEach(() => { propose.mockClear(); });

  it("proposes a SPRINT_PLAN filled to the seed capacity", async () => {
    candidateTasksForSprint.mockResolvedValueOnce([
      { externalId: "a", title: "A", priority: 1, createdAt: new Date("2026-01-02"), status: "BACKLOG" },
      { externalId: "b", title: "B", priority: 3, createdAt: new Date("2026-01-01"), status: "BACKLOG" },
    ]);
    const out = await sprintAgent.run(ctx);
    expect(out.planned).toBe(2);
    expect(propose).toHaveBeenCalledTimes(1);
    const arg = propose.mock.calls[0][0];
    expect(arg.kind).toBe("SPRINT_PLAN");
    expect(arg.createdBy).toBe("sprint");
    expect(arg.payload.taskExternalIds).toEqual(["a", "b"]);
    expect(arg.payload.rationale).toBe("because");
  });

  it("skips proposing when there are no candidates", async () => {
    candidateTasksForSprint.mockResolvedValueOnce([]);
    const out = await sprintAgent.run(ctx);
    expect(out.planned).toBe(0);
    expect(propose).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sprint.agent.test.ts`
Expected: FAIL — current `sprintAgent.run` returns `{ planned: 0 }` and never calls `propose`.

- [ ] **Step 3: Write the rationale module**

```ts
// src/agents/sprint/rationale.ts
import { complete } from "@/llm/client";
import type { CandidateTask, SprintSelection } from "@/agents/sprint/plan";

// The ONLY LLM use in the planner: a human-readable "why this sprint" note.
// Selection is deterministic; a failure here must not block the proposal.
export async function sprintRationale(candidates: CandidateTask[], selection: SprintSelection): Promise<string> {
  const chosen = new Set(selection.taskExternalIds);
  const lines = candidates
    .filter((c) => chosen.has(c.externalId))
    .map((c) => `- ${c.title} (priority ${c.priority ?? "none"})`)
    .join("\n");
  try {
    return await complete({
      system:
        "You are a technical program manager. In 2-3 sentences, explain why this " +
        "sprint selection is sensible given priority and age. No preamble.",
      prompt: `Capacity: ${selection.capacityTarget} tickets.\nSelected:\n${lines}`,
      maxTokens: 300,
    });
  } catch {
    return `Selected the top ${selection.taskExternalIds.length} tickets by priority, then age.`;
  }
}
```

- [ ] **Step 4: Write the agent**

```ts
// src/agents/sprint/index.ts
import type { Agent } from "@/agents/types";
import { recordAction } from "@/state/versioned/provenance";
import { programModel } from "@/state/model/repository";
import { sprintConfig } from "@/config/sprint";
import { selectCandidates, prioritize, proposeCapacity, fillSprint, sprintWindow } from "@/agents/sprint/plan";
import { sprintRationale } from "@/agents/sprint/rationale";
import { hitl } from "@/hitl/gate";

export interface SprintOutput { planned: number; blockers: number }

// Plans one rolling sprint from managed-project backlog and emits a SPRINT_PLAN
// proposal for HITL. Selection is deterministic; the LLM only writes rationale.
// No Linear writes here — applying is the HITL effect (Phase 3).
export const sprintAgent: Agent<void, SprintOutput> = {
  name: "sprint",
  async run(ctx) {
    const cfg = sprintConfig();
    const now = new Date();
    const all = await programModel.candidateTasksForSprint(ctx.programId);
    const activeIds = await programModel.activeSprintTaskIds(now);
    const candidates = selectCandidates(all, activeIds);
    if (candidates.length === 0) {
      ctx.logger.info("sprint: no candidate tasks; nothing to propose");
      return { planned: 0, blockers: 0 };
    }
    const history = await programModel.completedSprintCounts(ctx.programId);
    const capacity = proposeCapacity(history, cfg.seedCapacity);
    const selection = fillSprint(prioritize(candidates), capacity);
    const window = sprintWindow(cfg.lengthDays, now);
    const index = (await programModel.sprintCount()) + 1;
    const rationale = await sprintRationale(candidates, selection);

    await hitl.propose({
      kind: "SPRINT_PLAN",
      summary: `Sprint ${index}: ${selection.taskExternalIds.length} tickets (${window.startsAt.slice(0, 10)} → ${window.endsAt.slice(0, 10)})`,
      createdBy: "sprint",
      payload: {
        index,
        startsAt: window.startsAt,
        endsAt: window.endsAt,
        capacityTarget: selection.capacityTarget,
        taskExternalIds: selection.taskExternalIds,
        rationale,
        teamKey: cfg.team,
      },
    });
    await recordAction({ actor: "sprint", action: "plan", detail: { index, count: selection.taskExternalIds.length } });
    return { planned: selection.taskExternalIds.length, blockers: 0 };
  },
};
```

- [ ] **Step 5: Point the cron at the real program id**

In `src/schedule/routines/sprintCadence.ts`, replace the hardcoded `programId: "default"` so the agent plans the live program:
```ts
import { inngest } from "@/schedule/inngest";
import { sprintAgent } from "@/agents/sprint";
import { programModel } from "@/state/model/repository";
import { log } from "@/logger";

export const sprintCadence = inngest.createFunction(
  { id: "sprint-cadence" },
  { cron: "0 9 * * 1" },
  async ({ step }) => {
    return step.run("plan-sprint", async () => {
      const programId = await programModel.primaryProgramId();
      if (!programId) return { planned: 0, blockers: 0 };
      return sprintAgent.run({ programId, logger: log.child({ run: "sprint-cadence" }) });
    });
  },
);
```

- [ ] **Step 6: Run tests + typecheck + full suite**

Run: `npx vitest run tests/sprint.agent.test.ts && npm run typecheck && npx vitest run`
Expected: sprint agent tests PASS; typecheck clean; full suite green.

- [ ] **Step 7: Commit**

```bash
git add src/agents/sprint/index.ts src/agents/sprint/rationale.ts src/schedule/routines/sprintCadence.ts tests/sprint.agent.test.ts
git commit -m "feat(sprint): sprint agent emits SPRINT_PLAN proposal (no writes)"
```

---

### Task 7: Dashboard — current sprint panel

**Files:**
- Create: `src/components/viz/CurrentSprint.tsx`
- Modify: `app/(dash)/sprints/page.tsx`

**Interfaces:**
- Consumes: `programModel.currentSprint()` → `CurrentSprint | null` (Task 5).

- [ ] **Step 1: Write the component**

```tsx
// src/components/viz/CurrentSprint.tsx
import type { CurrentSprint as CurrentSprintData } from "@/state/model/repository";

export function CurrentSprint({ sprint }: { sprint: CurrentSprintData | null }) {
  if (!sprint) {
    return <p style={{ color: "var(--text-dim)", fontSize: 13 }}>No sprint proposed yet. It runs Mondays, or on demand.</p>;
  }
  const window = `${sprint.startsAt.slice(0, 10)} → ${sprint.endsAt.slice(0, 10)}`;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
        <span>Sprint {sprint.index} · {sprint.count}/{sprint.capacityTarget} tickets · {window}</span>
        <span style={{ color: "var(--text-dim)" }}>{sprint.state.toLowerCase()}</span>
      </div>
      {sprint.rationale && <p style={{ color: "var(--text-dim)", fontSize: 12, margin: 0 }}>{sprint.rationale}</p>}
      <ul style={{ margin: 0, paddingLeft: 16, fontSize: 13 }}>
        {sprint.tickets.map((t) => (
          <li key={t.externalId}>
            {t.title}
            {t.priority ? <span style={{ color: "var(--text-dim)" }}> · P{t.priority}</span> : null}
            {t.assignee ? <span style={{ color: "var(--text-dim)" }}> · {t.assignee}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Wire it into the sprints page**

```tsx
// app/(dash)/sprints/page.tsx
import { programModel } from "@/state/model/repository";
import { Panel } from "@/components/ui/primitives";
import { VelocityBars } from "@/components/viz/VelocityBars";
import { CurrentSprint } from "@/components/viz/CurrentSprint";
export const dynamic = "force-dynamic";

export default async function Sprints() {
  const pid = await programModel.primaryProgramId();
  const [velocity, sprint] = await Promise.all([
    pid ? programModel.velocityByTeam(pid) : Promise.resolve([]),
    programModel.currentSprint(),
  ]);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Panel title="Current sprint" hint="proposed plan (pending approval)"><CurrentSprint sprint={sprint} /></Panel>
      <Panel title="Sprints" hint="velocity by team"><VelocityBars teams={velocity} /></Panel>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + build**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 4: Manual verification**

Run the app (`npm run dev`), open `/sprints`. With no proposal yet it shows "No sprint proposed yet." (Generating a real proposal is exercised in Phase-3 testing or by invoking the agent; not required to pass this task.)

- [ ] **Step 5: Commit**

```bash
git add src/components/viz/CurrentSprint.tsx "app/(dash)/sprints/page.tsx"
git commit -m "feat(sprint): current sprint panel on /sprints"
```

---

## Phase-2 done — what you have

De-noised dashboard (only `managed` initiatives count) and a deterministic, LLM-annotated sprint proposal visible on `/sprints` and in the approvals inbox — with **zero Linear writes**.

## Follow-up: Phase 3–4 (separate plan)

- **Write-back:** add `createCycle` / `assignIssueToCycle` to `src/integrations/linear/write.ts`; a `SPRINT_PLAN` effect in `src/hitl/effects.ts` that, on approval, creates the Linear cycle(s) and assigns the selected issues; resolve `STRATEGOS_SPRINT_TEAM` → teamId. Idempotent + `FAILED` on cycles-disabled.
- **Learn loop:** cycle-completion sync writes `VelocitySnapshot` (committed = planned count, completed = done), which `proposeCapacity` already consumes.

## Self-review

- **Spec coverage:** scope filter ✓ (Task 3, via `managed`), config ✓ (Task 1), engine ✓ (Task 4), agent+proposal ✓ (Task 6), dashboard read ✓ (Task 7), data model `SPRINT_PLAN` ✓ (Task 2). Write-back + learn deliberately deferred to Phase 3–4 (flagged).
- **Deviation flagged:** spec's task-level dependency ordering and "skip blocked task" are omitted in v1 because dependencies are epic-level and unsynced (see Refinements). Not a silent drop.
- **Type consistency:** `CandidateTask` defined in Task 4, consumed identically in Tasks 5–6; `CurrentSprint`/`SprintTicket` defined in Task 5, consumed in Task 7; `SprintPayload` shape matches the agent's `hitl.propose` payload in Task 6.
- **Placeholder scan:** none — every step has real code/commands.
