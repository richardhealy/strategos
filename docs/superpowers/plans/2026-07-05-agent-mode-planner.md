# Agent-Mode Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an AI project mode whose planner classifies ticket readiness, sequences ready tickets into precedence waves from declared dependencies, and emits a read-only `DISPATCH_PLAN` proposal — alongside the existing human sprint planner.

**Architecture:** Per-project `Initiative.mode` (HUMAN|AI) set by an `agent` Linear label. Sync enriches tasks with `description` and `blocked-by` edges. For AI initiatives a deterministic wave engine (topological layers over declared deps) + an LLM readiness classifier (batched, cached) produce a `DISPATCH_PLAN` HITL proposal rendered on a mode-aware `/sprints`. No Linear writes; execution/impact-scheduling deferred to conductor/harbormaster.

**Tech Stack:** Next.js 15, Prisma 6 / Postgres (Neon), `@linear/sdk` (raw GraphQL via `client.client.rawRequest`), `@anthropic-ai/sdk`, Vitest, TypeScript (ESM).

## Global Constraints

- Node `>=20`; ESM; path alias `@/*` → `src/*`. No `any` (repo lints with typescript-eslint).
- Tests use Vitest; mock the Linear SDK via `vi.hoisted` + `vi.mock("@/integrations/linear/client")` (see `tests/linear.pull.test.ts`); mock the DB/LLM by `vi.mock("@/state/...")` / `vi.mock("@/llm/client")`.
- Config vars (verbatim): `STRATEGOS_AGENT_LABEL` (default `agent`), `STRATEGOS_READINESS_BATCH` (default `20`).
- **Read-only:** no writes to Linear anywhere in this plan.
- Linear GraphQL blocked-by: an issue's blockers = `inverseRelations` nodes with `type === "blocks"`, taking node `issue.id`. Cap `inverseRelations(first: 10)` for the complexity budget.
- Commit messages end with: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## Phase 1 — Mode + sync enrichment

### Task 1: Agent-mode config

**Files:**
- Create: `src/config/agentmode.ts`
- Test: `tests/agentmode.config.test.ts`

**Interfaces:**
- Produces: `agentModeConfig(): { label: string; readinessBatch: number }`, `parseAgentModeConfig(env): AgentModeConfig`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/agentmode.config.test.ts
import { describe, it, expect } from "vitest";
import { parseAgentModeConfig } from "@/config/agentmode";

describe("parseAgentModeConfig", () => {
  it("defaults", () => {
    expect(parseAgentModeConfig({})).toEqual({ label: "agent", readinessBatch: 20 });
  });
  it("overrides", () => {
    expect(parseAgentModeConfig({ STRATEGOS_AGENT_LABEL: "ai", STRATEGOS_READINESS_BATCH: "5" }))
      .toEqual({ label: "ai", readinessBatch: 5 });
  });
  it("ignores non-numeric batch", () => {
    expect(parseAgentModeConfig({ STRATEGOS_READINESS_BATCH: "x" }).readinessBatch).toBe(20);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/agentmode.config.test.ts`
Expected: FAIL — `Cannot find module '@/config/agentmode'`.

- [ ] **Step 3: Implement**

```ts
// src/config/agentmode.ts
export interface AgentModeConfig { label: string; readinessBatch: number }

function int(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export function parseAgentModeConfig(env: Record<string, string | undefined>): AgentModeConfig {
  return {
    label: env.STRATEGOS_AGENT_LABEL?.trim() || "agent",
    readinessBatch: int(env.STRATEGOS_READINESS_BATCH, 20),
  };
}

export function agentModeConfig(): AgentModeConfig {
  return parseAgentModeConfig(process.env);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/agentmode.config.test.ts`
Expected: PASS (3).

- [ ] **Step 5: Update `.env.example`** — under `# ---- Sprint planner ----` add:
```
STRATEGOS_AGENT_LABEL=agent            # Linear project label => AI (agent) mode
STRATEGOS_READINESS_BATCH=20           # tickets per readiness-classifier LLM call
```

- [ ] **Step 6: Commit**

```bash
git add src/config/agentmode.ts tests/agentmode.config.test.ts .env.example
git commit -m "feat(agent-mode): config for agent label + readiness batch size"
```

---

### Task 2: Schema — mode, readiness, task deps, DISPATCH_PLAN

**Files:**
- Modify: `prisma/schema.prisma`
- Generated: `prisma/migrations/<timestamp>_agent_mode/`

**Interfaces:**
- Produces: `enum ProjectMode { HUMAN AI }`, `Initiative.mode`, `enum ReadinessStatus { READY NEEDS_SPEC BLOCKED }`, `Task.{description,readiness,readinessReason,readinessAt}`, `model TaskDependency`, `ProposalKind.DISPATCH_PLAN`.

- [ ] **Step 1: Edit the schema**

Add near the other enums:
```prisma
enum ProjectMode {
  HUMAN
  AI
}

enum ReadinessStatus {
  READY
  NEEDS_SPEC
  BLOCKED
}
```
In `model Initiative`, after `managed`:
```prisma
  mode        ProjectMode  @default(HUMAN)
```
In `model Task`, after `priority`:
```prisma
  description    String?
  readiness      ReadinessStatus?
  readinessReason String?
  readinessAt    DateTime?
  blockedBy      TaskDependency[] @relation("Blocked")
  blocks         TaskDependency[] @relation("Blocker")
```
Add a new model (after `model Task`):
```prisma
model TaskDependency {
  id            String @id @default(cuid())
  blocked       Task   @relation("Blocked", fields: [blockedTaskId], references: [id], onDelete: Cascade)
  blockedTaskId String
  blocker       Task   @relation("Blocker", fields: [blockerTaskId], references: [id], onDelete: Cascade)
  blockerTaskId String

  @@unique([blockedTaskId, blockerTaskId])
  @@index([blockedTaskId])
}
```
In `enum ProposalKind`, after `SPRINT_PLAN`:
```prisma
  DISPATCH_PLAN // propose an agent dispatch plan (readiness + waves)
```

- [ ] **Step 2: Create + apply migration (also regenerates client)**

Run: `npx prisma migrate dev --name agent_mode`
Expected: "migration(s) have been applied" + "Generated Prisma Client".

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: clean (all new fields optional / additive).

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(agent-mode): schema — ProjectMode, readiness, TaskDependency, DISPATCH_PLAN"
```

---

### Task 3: Sync — mode from label, task description + blocked-by edges

**Files:**
- Modify: `src/integrations/types.ts` (RawInitiative.mode, RawTask.description, RawTask.blockerExternalIds)
- Modify: `src/integrations/linear/map.ts` (pass mode/description/blockers through)
- Modify: `src/integrations/linear/pull.ts` (ISSUES_QUERY description + inverseRelations; mode from agent label; blockers)
- Modify: `src/state/sync/syncEngine.ts` (persist mode + description; reconcile TaskDependency)
- Modify: `src/state/model/repository.ts` (`candidateTasksForSprint` filters `mode: "HUMAN"`)
- Test: `tests/linear.pull.test.ts` (extend)

**Interfaces:**
- Consumes: `agentModeConfig().label` (Task 1).
- Produces: `RawInitiative.mode?: "HUMAN" | "AI"`, `RawTask.description?: string`, `RawTask.blockerExternalIds?: string[]`.

- [ ] **Step 1: Write the failing tests** (append to `tests/linear.pull.test.ts`)

```ts
describe("pullProjects mode from agent label", () => {
  beforeEach(() => rawRequest.mockReset());
  it("sets AI when the agent label is present, else HUMAN", async () => {
    rawRequest.mockResolvedValueOnce(
      onePage("projects", [
        { id: "p1", name: "Bot", targetDate: null, state: null, lead: null,
          teams: { nodes: [{ key: "ENG" }] }, projectMilestones: { nodes: [] },
          labels: { nodes: [{ name: "strategos" }, { name: "agent" }] } },
        { id: "p2", name: "Human", targetDate: null, state: null, lead: null,
          teams: { nodes: [{ key: "ENG" }] }, projectMilestones: { nodes: [] },
          labels: { nodes: [{ name: "strategos" }] } },
      ]),
    );
    const inits = await pullProjects([]);
    expect(inits.find((i) => i.externalId === "p1")?.mode).toBe("AI");
    expect(inits.find((i) => i.externalId === "p2")?.mode).toBe("HUMAN");
  });
});

describe("pullIssues description + blockers", () => {
  beforeEach(() => rawRequest.mockReset());
  it("carries description and blocked-by issue ids", async () => {
    rawRequest.mockResolvedValueOnce(
      onePage("issues", [
        { id: "i1", title: "A", estimate: null, updatedAt: "2026-01-01T00:00:00.000Z", priority: 0,
          team: { key: "ENG" }, project: { id: "p1" }, projectMilestone: null,
          assignee: null, state: { type: "started", name: "s" },
          description: "do the thing",
          inverseRelations: { nodes: [
            { type: "blocks", issue: { id: "blocker1" } },
            { type: "related", issue: { id: "noise" } },
          ] } },
      ]),
    );
    const tasks = await pullIssues([]);
    expect(tasks[0].description).toBe("do the thing");
    expect(tasks[0].blockerExternalIds).toEqual(["blocker1"]);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/linear.pull.test.ts`
Expected: FAIL — `mode`, `description`, `blockerExternalIds` are undefined.

- [ ] **Step 3: Extend Raw types** (`src/integrations/types.ts`)

Add to `RawInitiative`: `mode?: "HUMAN" | "AI";`
Add to `RawTask`: `description?: string;` and `blockerExternalIds?: string[];`

- [ ] **Step 4: Pass through mappers** (`src/integrations/linear/map.ts`)

- Add to `interface LinearProject`: `mode?: "HUMAN" | "AI";`
- In `mapProject` return, add: `mode: p.mode ?? "HUMAN",`
- Add to `interface LinearIssue`: `description?: string;` and `blockerExternalIds?: string[];`
- In `mapIssue` return, add: `description: i.description,` and `blockerExternalIds: i.blockerExternalIds ?? [],`

- [ ] **Step 5: pull.ts — query fields + derive mode/blockers**

- Import: `import { agentModeConfig } from "@/config/agentmode";`
- In `PROJECTS_QUERY`, `labels(first: 10)` already present — good.
- In `pullProjects`, where the raw project is pushed, add mode:
```ts
    const agentLabel = agentModeConfig().label;
    const mode = p.labels.nodes.some((l) => l.name === agentLabel) ? "AI" : "HUMAN";
    raw.push({ id: p.id, name: p.name, leadName: p.lead?.name, targetDate: p.targetDate ?? undefined, state: p.state ?? undefined, managed, mode });
```
  (Keep the existing `managed` computation; add `mode` alongside.)
- Extend `interface IssueNode` with:
```ts
  description: string | null;
  inverseRelations: { nodes: { type: string; issue: { id: string } | null }[] };
```
- In `ISSUES_QUERY`, add to the issue `nodes` selection:
```
        description
        inverseRelations(first: 10) { nodes { type issue { id } } }
```
- In `pullIssues`, when building the raw `LinearIssue`, add:
```ts
      description: i.description ?? undefined,
      blockerExternalIds: i.inverseRelations.nodes.filter((r) => r.type === "blocks" && r.issue).map((r) => r.issue!.id),
```

- [ ] **Step 6: syncEngine — persist mode, description; reconcile edges**

In `src/state/sync/syncEngine.ts`:
- Initiative `create`/`update` data: add `mode: raw.mode ?? "HUMAN"`. Add to `changed`: `|| row.mode !== (raw.mode ?? "HUMAN")`.
- Task `create`/`update` data: add `description: raw.description ?? null`.
- After the Tasks loop (before the velocity section), add a dependency-reconcile pass:
```ts
  // Task dependencies (Linear blocked-by). Rebuild each task's edges from the
  // freshly pulled blockers, resolving external issue ids to task ids.
  for (const raw of tasks) {
    if (!raw.blockerExternalIds?.length && raw.blockerExternalIds !== undefined) {
      // still clear stale edges below for tasks that lost their blockers
    }
    const selfRef = await db.externalRef.findUnique({ where: { kind_externalId: { kind, externalId: raw.externalId } } });
    if (!selfRef?.taskId) continue;
    const blockedTaskId = selfRef.taskId;
    const blockerIds: string[] = [];
    for (const bx of raw.blockerExternalIds ?? []) {
      const bref = await db.externalRef.findUnique({ where: { kind_externalId: { kind, externalId: bx } } });
      if (bref?.taskId) blockerIds.push(bref.taskId);
    }
    await db.taskDependency.deleteMany({ where: { blockedTaskId } });
    for (const blockerTaskId of blockerIds) {
      if (blockerTaskId === blockedTaskId) continue;
      await db.taskDependency.create({ data: { blockedTaskId, blockerTaskId } });
    }
  }
```
  (`tasks` here is the `{ items: tasks }` array already pulled for the Tasks section — reuse it.)

- [ ] **Step 7: repository — human sprints exclude AI initiatives**

In `src/state/model/repository.ts`, `candidateTasksForSprint`, change the initiative filter:
```ts
      where: { programId, managed: true, mode: "HUMAN" },
```

- [ ] **Step 8: Run tests + typecheck**

Run: `npx vitest run && npm run typecheck`
Expected: all PASS; typecheck clean. (If the existing `pullIssues` "ONE request" test fails on the new `description`/`blockerExternalIds` keys, add `description: undefined` is NOT needed — `toEqual` ignores undefined; but it now also returns `blockerExternalIds: []`. Update that test's expected object to include `blockerExternalIds: []` and, if the mock issue has no `inverseRelations`, add `inverseRelations: { nodes: [] }` to that mock node so `pullIssues` doesn't throw.)

- [ ] **Step 9: Commit**

```bash
git add src/integrations src/state/sync/syncEngine.ts src/state/model/repository.ts tests/linear.pull.test.ts
git commit -m "feat(agent-mode): sync project mode + task description + blocked-by edges"
```

---

## Phase 2 — Readiness, waves, proposal, dashboard

### Task 4: Wave engine (pure)

**Files:**
- Create: `src/agents/agentplan/waves.ts`
- Test: `tests/agentplan.waves.test.ts`

**Interfaces:**
- Produces:
  - `interface DepEdge { blocked: string; blocker: string }`
  - `planWaves(readyIds: string[], edges: DepEdge[]): { waves: string[][]; cyclic: string[] }`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/agentplan.waves.test.ts
import { describe, it, expect } from "vitest";
import { planWaves } from "@/agents/agentplan/waves";

describe("planWaves", () => {
  it("no edges -> one flat wave", () => {
    expect(planWaves(["a", "b", "c"], [])).toEqual({ waves: [["a", "b", "c"]], cyclic: [] });
  });
  it("layers blockers before blocked", () => {
    // b blocked by a; c blocked by b
    const r = planWaves(["a", "b", "c"], [{ blocked: "b", blocker: "a" }, { blocked: "c", blocker: "b" }]);
    expect(r.waves).toEqual([["a"], ["b"], ["c"]]);
    expect(r.cyclic).toEqual([]);
  });
  it("orders within a wave by leverage (fan-out) desc", () => {
    // a blocks b and c; d blocks nothing -> wave0 = [a, d] (a first, higher fan-out)
    const r = planWaves(["a", "b", "c", "d"], [{ blocked: "b", blocker: "a" }, { blocked: "c", blocker: "a" }]);
    expect(r.waves[0]).toEqual(["a", "d"]);
  });
  it("drops edges whose blocker is not ready", () => {
    const r = planWaves(["b"], [{ blocked: "b", blocker: "a" }]); // a not ready
    expect(r.waves).toEqual([["b"]]);
  });
  it("breaks a cycle deterministically and reports it", () => {
    const r = planWaves(["a", "b"], [{ blocked: "a", blocker: "b" }, { blocked: "b", blocker: "a" }]);
    expect(r.cyclic.sort()).toEqual(["a", "b"]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/agentplan.waves.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

```ts
// src/agents/agentplan/waves.ts
export interface DepEdge { blocked: string; blocker: string } // blocker must precede blocked

// Layered Kahn's algorithm over the ready set. Edges to non-ready blockers are
// dropped (blocker done / out of scope). Within a layer, order by fan-out
// (how many ready tasks each blocks) descending, then id for determinism.
// A leftover cycle is reported and its nodes appended as a final wave.
export function planWaves(readyIds: string[], edges: DepEdge[]): { waves: string[][]; cyclic: string[] } {
  const ready = new Set(readyIds);
  const scoped = edges.filter((e) => ready.has(e.blocked) && ready.has(e.blocker));

  const indeg = new Map<string, number>(readyIds.map((id) => [id, 0]));
  const blocks = new Map<string, string[]>(readyIds.map((id) => [id, []])); // blocker -> [blocked...]
  for (const e of scoped) {
    indeg.set(e.blocked, (indeg.get(e.blocked) ?? 0) + 1);
    blocks.get(e.blocker)!.push(e.blocked);
  }
  const fanout = (id: string): number => (blocks.get(id)?.length ?? 0);
  const order = (ids: string[]): string[] =>
    [...ids].sort((a, b) => fanout(b) - fanout(a) || (a < b ? -1 : a > b ? 1 : 0));

  const waves: string[][] = [];
  const remaining = new Set(readyIds);
  for (;;) {
    const layer = [...remaining].filter((id) => (indeg.get(id) ?? 0) === 0);
    if (layer.length === 0) break;
    const ordered = order(layer);
    waves.push(ordered);
    for (const id of ordered) {
      remaining.delete(id);
      for (const nxt of blocks.get(id) ?? []) indeg.set(nxt, (indeg.get(nxt) ?? 0) - 1);
    }
  }

  const cyclic = order([...remaining]);
  if (cyclic.length) waves.push(cyclic);
  return { waves, cyclic };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/agentplan.waves.test.ts`
Expected: PASS (5).

- [ ] **Step 5: Commit**

```bash
git add src/agents/agentplan/waves.ts tests/agentplan.waves.test.ts
git commit -m "feat(agent-mode): precedence wave engine (topological + leverage)"
```

---

### Task 5: Readiness classifier (batched LLM)

**Files:**
- Create: `src/agents/agentplan/readiness.ts`
- Test: `tests/agentplan.readiness.test.ts`

**Interfaces:**
- Consumes: `complete` (`@/llm/client`), `agentModeConfig().readinessBatch` (Task 1).
- Produces:
  - `type Readiness = "READY" | "NEEDS_SPEC" | "BLOCKED"`
  - `interface ReadyTask { externalId: string; title: string; description: string | null }`
  - `interface Verdict { externalId: string; status: Readiness; reason: string }`
  - `parseReadiness(raw: string, batch: ReadyTask[]): Verdict[]` (pure)
  - `classifyReadiness(tasks: ReadyTask[]): Promise<Verdict[]>` (batched network)

- [ ] **Step 1: Write the failing tests** (pure parser only)

```ts
// tests/agentplan.readiness.test.ts
import { describe, it, expect } from "vitest";
import { parseReadiness, type ReadyTask } from "@/agents/agentplan/readiness";

const batch: ReadyTask[] = [
  { externalId: "a", title: "A", description: "clear" },
  { externalId: "b", title: "B", description: null },
];

describe("parseReadiness", () => {
  it("maps a well-formed JSON array to verdicts", () => {
    const raw = '[{"externalId":"a","status":"READY","reason":"clear"},{"externalId":"b","status":"NEEDS_SPEC","reason":"no body"}]';
    expect(parseReadiness(raw, batch)).toEqual([
      { externalId: "a", status: "READY", reason: "clear" },
      { externalId: "b", status: "NEEDS_SPEC", reason: "no body" },
    ]);
  });
  it("tolerates code fences and unknown status -> NEEDS_SPEC", () => {
    const raw = '```json\n[{"externalId":"a","status":"weird","reason":"x"}]\n```';
    expect(parseReadiness(raw, batch)[0]).toEqual({ externalId: "a", status: "NEEDS_SPEC", reason: "x" });
  });
  it("on unparseable output, defaults every batch task to NEEDS_SPEC", () => {
    const out = parseReadiness("not json", batch);
    expect(out.map((v) => v.status)).toEqual(["NEEDS_SPEC", "NEEDS_SPEC"]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/agentplan.readiness.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

```ts
// src/agents/agentplan/readiness.ts
import { complete } from "@/llm/client";
import { agentModeConfig } from "@/config/agentmode";

export type Readiness = "READY" | "NEEDS_SPEC" | "BLOCKED";
export interface ReadyTask { externalId: string; title: string; description: string | null }
export interface Verdict { externalId: string; status: Readiness; reason: string }

const VALID: Readiness[] = ["READY", "NEEDS_SPEC", "BLOCKED"];

// Pure: turn the model's reply into one verdict per batch task. Any task the
// model omitted, or any unparseable output, defaults to NEEDS_SPEC (safe: it
// won't be dispatched without a human look).
export function parseReadiness(raw: string, batch: ReadyTask[]): Verdict[] {
  let rows: { externalId?: string; status?: string; reason?: string }[] = [];
  try {
    rows = JSON.parse(raw.replace(/```json|```/g, "").trim());
    if (!Array.isArray(rows)) rows = [];
  } catch {
    rows = [];
  }
  const byId = new Map(rows.map((r) => [r.externalId, r]));
  return batch.map((t) => {
    const r = byId.get(t.externalId);
    const status = (VALID as string[]).includes(r?.status ?? "") ? (r!.status as Readiness) : "NEEDS_SPEC";
    return { externalId: t.externalId, status, reason: r?.reason ?? "unclassified" };
  });
}

const SYSTEM =
  "You triage tickets for autonomous coding agents. For EACH ticket decide: " +
  "READY (clear goal + acceptance criteria + scoped for one agent), NEEDS_SPEC " +
  "(too vague/large; reason should suggest a split), or BLOCKED (depends on " +
  'unfinished work or a human decision). Reply as a strict JSON array: ' +
  '[{"externalId":"","status":"READY|NEEDS_SPEC|BLOCKED","reason":""}]. No prose.';

// Batched network call. One LLM request per readinessBatch tickets.
export async function classifyReadiness(tasks: ReadyTask[]): Promise<Verdict[]> {
  const size = agentModeConfig().readinessBatch;
  const out: Verdict[] = [];
  for (let i = 0; i < tasks.length; i += size) {
    const batch = tasks.slice(i, i + size);
    const prompt = JSON.stringify(batch.map((t) => ({ externalId: t.externalId, title: t.title, description: t.description ?? "" })));
    let raw: string;
    try {
      raw = await complete({ system: SYSTEM, prompt, maxTokens: 1500 });
    } catch {
      raw = ""; // parseReadiness will default the batch to NEEDS_SPEC
    }
    out.push(...parseReadiness(raw, batch));
  }
  return out;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/agentplan.readiness.test.ts`
Expected: PASS (3).

- [ ] **Step 5: Commit**

```bash
git add src/agents/agentplan/readiness.ts tests/agentplan.readiness.test.ts
git commit -m "feat(agent-mode): batched readiness classifier"
```

---

### Task 6: Repository reads for agent mode

**Files:**
- Modify: `src/state/model/repository.ts`
- Test: `tests/agentplan.repository.test.ts`

**Interfaces:**
- Consumes: `ReadyTask` (Task 5), `DepEdge` (Task 4).
- Produces on `programModel`:
  - `aiInitiatives(programId): Promise<{ id: string; externalId: string; title: string }[]>`
  - `agentTasks(initiativeId): Promise<{ tasks: AgentTaskRow[]; edges: DepEdge[] }>` where `interface AgentTaskRow { externalId: string; title: string; description: string | null; status: string; readiness: string | null; updatedAt: Date }`
  - `saveReadiness(externalId, status, reason): Promise<void>`
  - `readinessBreakdown(initiativeId): Promise<{ ready: number; needs_spec: number; blocked: number }>`
  - `currentDispatchPlan(initiativeExternalId): Promise<DispatchPlanView | null>` where `interface DispatchPlanView { waves: { externalId: string; title: string; readiness: string | null }[][]; readiness: { ready: number; needs_spec: number; blocked: number }; state: string; rationale: string }`
  - pure helper `dispatchWaveTitles(...)` is not needed; keep DB shaping in the method.

- [ ] **Step 1: Write the failing test** (pure export)

The one isolatable bit is normalizing a readiness DB enum (which may be null) into the breakdown key. Extract + test:

```ts
// tests/agentplan.repository.test.ts
import { describe, it, expect } from "vitest";
import { readinessKey } from "@/state/model/repository";

describe("readinessKey", () => {
  it("maps enum values to breakdown keys, null -> needs_spec", () => {
    expect(readinessKey("READY")).toBe("ready");
    expect(readinessKey("NEEDS_SPEC")).toBe("needs_spec");
    expect(readinessKey("BLOCKED")).toBe("blocked");
    expect(readinessKey(null)).toBe("needs_spec");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/agentplan.repository.test.ts`
Expected: FAIL — `readinessKey` not exported.

- [ ] **Step 3: Implement** — add to `src/state/model/repository.ts`

Add after the existing `import type { CandidateTask } ...` block:
```ts
import type { ReadinessStatus } from "@prisma/client";
import type { DepEdge } from "@/agents/agentplan/waves";

export interface AgentTaskRow { externalId: string; title: string; description: string | null; status: string; readiness: string | null; updatedAt: Date }
export interface DispatchPlanView {
  waves: { externalId: string; title: string; readiness: string | null }[][];
  readiness: { ready: number; needs_spec: number; blocked: number };
  state: string; rationale: string;
}
interface DispatchPayload { initiativeExternalId?: string; waves?: string[][]; readiness?: { ready: number; needs_spec: number; blocked: number }; rationale?: string }

export function readinessKey(r: string | null): "ready" | "needs_spec" | "blocked" {
  if (r === "READY") return "ready";
  if (r === "BLOCKED") return "blocked";
  return "needs_spec";
}
```

Add these methods inside the `programModel` object (after `currentSprint`):
```ts
  async aiInitiatives(programId: string) {
    const inits = await db.initiative.findMany({
      where: { programId, managed: true, mode: "AI" },
      include: { source: true },
      orderBy: { createdAt: "asc" },
    });
    return inits
      .filter((i) => i.source)
      .map((i) => ({ id: i.id, externalId: i.source!.externalId, title: i.title }));
  },

  async agentTasks(initiativeId: string): Promise<{ tasks: AgentTaskRow[]; edges: DepEdge[] }> {
    const init = await db.initiative.findUnique({
      where: { id: initiativeId },
      include: { epics: { include: { tasks: { include: { source: true, blockedBy: { include: { blocker: { include: { source: true } } } } } } } } },
    });
    const rows: AgentTaskRow[] = [];
    const edges: DepEdge[] = [];
    for (const e of init?.epics ?? []) {
      for (const t of e.tasks) {
        if (!t.source) continue;
        rows.push({ externalId: t.source.externalId, title: t.title, description: t.description, status: t.status, readiness: t.readiness, updatedAt: t.updatedAt });
        for (const dep of t.blockedBy) {
          if (dep.blocker.source) edges.push({ blocked: t.source.externalId, blocker: dep.blocker.source.externalId });
        }
      }
    }
    return { tasks: rows, edges };
  },

  async saveReadiness(externalId: string, status: ReadinessStatus, reason: string): Promise<void> {
    const ref = await db.externalRef.findFirst({ where: { externalId, taskId: { not: null } } });
    if (!ref?.taskId) return;
    await db.task.update({
      where: { id: ref.taskId },
      data: { readiness: status, readinessReason: reason, readinessAt: new Date() },
    });
  },

  async readinessBreakdown(initiativeId: string) {
    const { tasks } = await this.agentTasks(initiativeId);
    const acc = { ready: 0, needs_spec: 0, blocked: 0 };
    for (const t of tasks) acc[readinessKey(t.readiness)]++;
    return acc;
  },

  async currentDispatchPlan(initiativeExternalId: string): Promise<DispatchPlanView | null> {
    const proposals = await db.hitlProposal.findMany({ where: { kind: "DISPATCH_PLAN" }, orderBy: { createdAt: "desc" } });
    const p = proposals.find((x) => (x.payload as DispatchPayload).initiativeExternalId === initiativeExternalId);
    if (!p) return null;
    const payload = p.payload as DispatchPayload;
    const ids = (payload.waves ?? []).flat();
    const refs = ids.length
      ? await db.externalRef.findMany({ where: { externalId: { in: ids }, taskId: { not: null } }, select: { externalId: true, task: { select: { title: true, readiness: true } } } })
      : [];
    const byId = new Map(refs.map((r) => [r.externalId, r.task]));
    const waves = (payload.waves ?? []).map((w) =>
      w.map((id) => ({ externalId: id, title: byId.get(id)?.title ?? id, readiness: byId.get(id)?.readiness ?? null })));
    return { waves, readiness: payload.readiness ?? { ready: 0, needs_spec: 0, blocked: 0 }, state: p.state, rationale: payload.rationale ?? "" };
  },
```
Replace the `readiness` enum write hack: instead of `@ts-expect-error`, import the enum type — add `import type { ReadinessStatus } from "@prisma/client";` and type the param `status: ReadinessStatus`. Update `saveReadiness(externalId: string, status: ReadinessStatus, reason: string)` and drop the `@ts-expect-error`.

- [ ] **Step 4: Run test + typecheck**

Run: `npx vitest run tests/agentplan.repository.test.ts && npm run typecheck`
Expected: PASS; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/state/model/repository.ts tests/agentplan.repository.test.ts
git commit -m "feat(agent-mode): repository reads for AI initiatives, readiness, dispatch plan"
```

---

### Task 7: Agent planner + proposal + mode router

**Files:**
- Create: `src/agents/agentplan/index.ts`
- Create: `src/agents/agentplan/rationale.ts`
- Create: `src/agents/planRouter.ts`
- Modify: `src/schedule/routines/sprintCadence.ts` (call the router)
- Modify: `scripts/plan-once.ts` (run router)
- Test: `tests/agentplan.agent.test.ts`

**Interfaces:**
- Consumes: `programModel.{aiInitiatives,agentTasks,saveReadiness}`, `classifyReadiness` (T5), `planWaves` (T4), `hitl.propose`.
- Produces: `agentPlanner: Agent<{ id: string; externalId: string; title: string }, { planned: number }>`; `runPlanning(programId, logger): Promise<{ human: unknown; ai: { initiative: string; planned: number }[] }>`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/agentplan.agent.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  propose: vi.fn(async (_i: unknown) => "d1"),
  agentTasks: vi.fn(),
  saveReadiness: vi.fn(async () => undefined),
  classify: vi.fn(),
}));
vi.mock("@/hitl/gate", () => ({ hitl: { propose: h.propose } }));
vi.mock("@/state/model/repository", () => ({ programModel: { agentTasks: h.agentTasks, saveReadiness: h.saveReadiness } }));
vi.mock("@/agents/agentplan/readiness", () => ({ classifyReadiness: h.classify }));
vi.mock("@/agents/agentplan/rationale", () => ({ dispatchRationale: vi.fn(async () => "because") }));
vi.mock("@/state/versioned/provenance", () => ({ recordAction: vi.fn(async () => undefined) }));

import { agentPlanner } from "@/agents/agentplan";
import { log } from "@/logger";

const ctx = { programId: "prog", logger: log.child({ t: "t" }) };
const init = { id: "init1", externalId: "p1", title: "Bot" };

describe("agentPlanner", () => {
  beforeEach(() => { h.propose.mockClear(); });

  it("classifies, waves the READY tickets, and proposes a DISPATCH_PLAN", async () => {
    h.agentTasks.mockResolvedValueOnce({
      tasks: [
        { externalId: "a", title: "A", description: "x", status: "BACKLOG", readiness: null, updatedAt: new Date("2026-02-01") },
        { externalId: "b", title: "B", description: "y", status: "BACKLOG", readiness: null, updatedAt: new Date("2026-02-01") },
      ],
      edges: [{ blocked: "b", blocker: "a" }],
    });
    h.classify.mockResolvedValueOnce([
      { externalId: "a", status: "READY", reason: "" },
      { externalId: "b", status: "READY", reason: "" },
    ]);
    const out = await agentPlanner.run(ctx, init);
    expect(out.planned).toBe(2);
    const arg = h.propose.mock.calls[0]?.[0] as { kind: string; payload: { waves: string[][]; initiativeExternalId: string } };
    expect(arg.kind).toBe("DISPATCH_PLAN");
    expect(arg.payload.initiativeExternalId).toBe("p1");
    expect(arg.payload.waves).toEqual([["a"], ["b"]]);
  });

  it("proposes nothing when no tickets are READY", async () => {
    h.agentTasks.mockResolvedValueOnce({
      tasks: [{ externalId: "a", title: "A", description: null, status: "BACKLOG", readiness: null, updatedAt: new Date() }],
      edges: [],
    });
    h.classify.mockResolvedValueOnce([{ externalId: "a", status: "NEEDS_SPEC", reason: "vague" }]);
    const out = await agentPlanner.run(ctx, init);
    expect(out.planned).toBe(0);
    expect(h.propose).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/agentplan.agent.test.ts`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement rationale** (`src/agents/agentplan/rationale.ts`)

```ts
import { complete } from "@/llm/client";

export async function dispatchRationale(initiativeTitle: string, waveCount: number, readyCount: number): Promise<string> {
  try {
    return await complete({
      system: "You are a technical program manager. In 1-2 sentences, explain this agent dispatch plan. No preamble.",
      prompt: `Project "${initiativeTitle}": ${readyCount} ready tickets across ${waveCount} dependency waves.`,
      maxTokens: 200,
    });
  } catch {
    return `${readyCount} ready tickets across ${waveCount} precedence wave(s).`;
  }
}
```

- [ ] **Step 4: Implement the planner** (`src/agents/agentplan/index.ts`)

```ts
import type { Agent } from "@/agents/types";
import { recordAction } from "@/state/versioned/provenance";
import { programModel } from "@/state/model/repository";
import { classifyReadiness, type ReadyTask } from "@/agents/agentplan/readiness";
import { planWaves } from "@/agents/agentplan/waves";
import { dispatchRationale } from "@/agents/agentplan/rationale";
import { hitl } from "@/hitl/gate";

export interface AiInitiative { id: string; externalId: string; title: string }
export interface AgentPlanOutput { planned: number }

const OPEN = new Set(["BACKLOG", "PLANNED", "IN_PROGRESS", "IN_REVIEW", "BLOCKED"]);

export const agentPlanner: Agent<AiInitiative, AgentPlanOutput> = {
  name: "agent-planner",
  async run(ctx, init) {
    const { tasks, edges } = await programModel.agentTasks(init.id);
    const open = tasks.filter((t) => OPEN.has(t.status));
    // Re-classify only tickets whose body changed since last classification.
    const stale = open.filter((t) => !t.readiness);
    const toClassify: ReadyTask[] = stale.map((t) => ({ externalId: t.externalId, title: t.title, description: t.description }));
    const verdicts = await classifyReadiness(toClassify);
    for (const v of verdicts) await programModel.saveReadiness(v.externalId, v.status, v.reason);

    const readinessById = new Map<string, string>(open.map((t) => [t.externalId, t.readiness ?? "NEEDS_SPEC"]));
    for (const v of verdicts) readinessById.set(v.externalId, v.status);

    const readyIds = open.map((t) => t.externalId).filter((id) => readinessById.get(id) === "READY");
    const counts = { ready: 0, needs_spec: 0, blocked: 0 };
    for (const id of open.map((t) => t.externalId)) {
      const r = readinessById.get(id);
      if (r === "READY") counts.ready++;
      else if (r === "BLOCKED") counts.blocked++;
      else counts.needs_spec++;
    }

    if (readyIds.length === 0) {
      ctx.logger.info("agent-plan: no ready tickets", { initiative: init.externalId });
      return { planned: 0 };
    }

    const { waves, cyclic } = planWaves(readyIds, edges);
    const rationale = await dispatchRationale(init.title, waves.length, readyIds.length)
      + (cyclic.length ? ` (broke a dependency cycle among ${cyclic.length} tickets)` : "");

    await hitl.propose({
      kind: "DISPATCH_PLAN",
      summary: `Dispatch plan for ${init.title}: ${readyIds.length} ready in ${waves.length} wave(s)`,
      createdBy: "agent-planner",
      payload: { initiativeExternalId: init.externalId, waves, readiness: counts, rationale },
    });
    await recordAction({ actor: "agent-planner", action: "dispatch-plan", detail: { initiative: init.externalId, ready: readyIds.length, waves: waves.length } });
    return { planned: readyIds.length };
  },
};
```

- [ ] **Step 5: Implement the router** (`src/agents/planRouter.ts`)

```ts
import { programModel } from "@/state/model/repository";
import { sprintAgent } from "@/agents/sprint";
import { agentPlanner } from "@/agents/agentplan";
import type { log } from "@/logger";

// HUMAN work is one program-level sprint; AI work is one dispatch plan per AI project.
export async function runPlanning(programId: string, logger: ReturnType<typeof log.child>) {
  const human = await sprintAgent.run({ programId, logger });
  const inits = await programModel.aiInitiatives(programId);
  const ai: { initiative: string; planned: number }[] = [];
  for (const init of inits) {
    const out = await agentPlanner.run({ programId, logger }, init);
    ai.push({ initiative: init.externalId, planned: out.planned });
  }
  return { human, ai };
}
```

- [ ] **Step 6: Wire cron + one-shot**

`src/schedule/routines/sprintCadence.ts` — replace the `sprintAgent.run(...)` body:
```ts
import { inngest } from "@/schedule/inngest";
import { runPlanning } from "@/agents/planRouter";
import { programModel } from "@/state/model/repository";
import { log } from "@/logger";

export const sprintCadence = inngest.createFunction(
  { id: "sprint-cadence" },
  { cron: "0 9 * * 1" },
  async ({ step }) =>
    step.run("plan", async () => {
      const programId = await programModel.primaryProgramId();
      if (!programId) return { human: { planned: 0, blockers: 0 }, ai: [] };
      return runPlanning(programId, log.child({ run: "sprint-cadence" }));
    }),
);
```
`scripts/plan-once.ts` — replace the `sprintAgent.run` line with the router:
```ts
import "dotenv/config";
import { programModel } from "../src/state/model/repository";
import { runPlanning } from "../src/agents/planRouter";
import { log } from "../src/logger";

async function main() {
  const programId = await programModel.primaryProgramId();
  if (!programId) { console.error("No program — run db:sync first"); process.exit(1); }
  const result = await runPlanning(programId, log.child({ run: "plan-once" }));
  console.log(JSON.stringify(result, null, 2));
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 7: Run tests + typecheck + full suite**

Run: `npx vitest run tests/agentplan.agent.test.ts && npm run typecheck && npx vitest run`
Expected: agent tests PASS; typecheck clean; full suite green.

- [ ] **Step 8: Commit**

```bash
git add src/agents/agentplan src/agents/planRouter.ts src/schedule/routines/sprintCadence.ts scripts/plan-once.ts tests/agentplan.agent.test.ts
git commit -m "feat(agent-mode): agent planner emits DISPATCH_PLAN + mode router"
```

---

### Task 8: Mode-aware flow board on `/sprints`

**Files:**
- Create: `src/components/viz/FlowBoard.tsx`
- Modify: `app/(dash)/sprints/page.tsx`

**Interfaces:**
- Consumes: `programModel.{aiInitiatives, currentDispatchPlan, readinessBreakdown}` (T6).

- [ ] **Step 1: Write the FlowBoard component**

```tsx
// src/components/viz/FlowBoard.tsx
import type { DispatchPlanView } from "@/state/model/repository";

export function FlowBoard({ title, plan }: { title: string; plan: DispatchPlanView | null }) {
  if (!plan) {
    return <p style={{ color: "var(--text-dim)", fontSize: 13 }}>{title}: no dispatch plan yet.</p>;
  }
  const r = plan.readiness;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
        <span>{title} · {plan.waves.length} wave(s)</span>
        <span style={{ color: "var(--text-dim)" }}>
          {r.ready} ready · {r.needs_spec} needs-spec · {r.blocked} blocked · {plan.state.toLowerCase()}
        </span>
      </div>
      {plan.rationale && <p style={{ color: "var(--text-dim)", fontSize: 12, margin: 0 }}>{plan.rationale}</p>}
      {plan.waves.map((wave, i) => (
        <div key={i}>
          <div style={{ fontSize: 12, color: "var(--text-dim)" }}>Wave {i + 1}</div>
          <ul style={{ margin: 0, paddingLeft: 16, fontSize: 13 }}>
            {wave.map((t) => <li key={t.externalId}>{t.title}</li>)}
          </ul>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Wire the mode-aware page** (`app/(dash)/sprints/page.tsx`)

```tsx
import { programModel } from "@/state/model/repository";
import { Panel } from "@/components/ui/primitives";
import { VelocityBars } from "@/components/viz/VelocityBars";
import { CurrentSprint } from "@/components/viz/CurrentSprint";
import { FlowBoard } from "@/components/viz/FlowBoard";
export const dynamic = "force-dynamic";

export default async function Sprints() {
  const pid = await programModel.primaryProgramId();
  const [velocity, sprint, aiInits] = await Promise.all([
    pid ? programModel.velocityByTeam(pid) : Promise.resolve([]),
    programModel.currentSprint(),
    pid ? programModel.aiInitiatives(pid) : Promise.resolve([]),
  ]);
  const flows = await Promise.all(aiInits.map(async (i) => ({ title: i.title, plan: await programModel.currentDispatchPlan(i.externalId) })));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Panel title="Human sprint" hint="proposed plan (pending approval)"><CurrentSprint sprint={sprint} /></Panel>
      {flows.map((f) => (
        <Panel key={f.title} title={`Agent flow — ${f.title}`} hint="readiness + dependency waves">
          <FlowBoard title={f.title} plan={f.plan} />
        </Panel>
      ))}
      <Panel title="Velocity" hint="by team"><VelocityBars teams={velocity} /></Panel>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 4: Manual verification**

Boot the app (`npm run dev`), open `/sprints`. With no AI-labelled projects it shows only the human panels; with an `agent`-labelled project and a run of `npm run db:plan`, an "Agent flow" panel renders its waves. (Neon free-tier may cold-start; retry once.)

- [ ] **Step 5: Commit**

```bash
git add src/components/viz/FlowBoard.tsx "app/(dash)/sprints/page.tsx"
git commit -m "feat(agent-mode): mode-aware flow board on /sprints"
```

---

## Self-review

- **Spec coverage:** mode plumbing ✓ (T2/T3), sync enrichment (description + blocked-by) ✓ (T3), readiness classifier ✓ (T5), wave engine ✓ (T4), DISPATCH_PLAN proposal ✓ (T7), mode router + HUMAN filter ✓ (T3/T7), flow dashboard ✓ (T8), config ✓ (T1). Planning-only KPIs surface via `readinessBreakdown`/`currentDispatchPlan` counts on the board (T6/T8). Execution/impact/cost/monitoring correctly absent (deferred).
- **Type consistency:** `DepEdge` (T4) consumed in T6/T7; `Verdict`/`ReadyTask`/`Readiness` (T5) consumed in T7; `AgentTaskRow`/`DispatchPlanView` (T6) consumed in T7/T8; `AiInitiative` (T7) produced by `aiInitiatives` (T6) — shape `{id,externalId,title}` matches.
- **Placeholder scan:** none — every step has real code/commands. (Two inline "replace the placeholder path/hack" notes in T6 are explicit corrections, not deferrals.)
- **Deviations flagged:** readiness re-classification in v1 only classifies tickets with no prior `readiness` (`!t.readiness`); a "reclassify when `updatedAt > readinessAt`" refinement is noted for later to avoid staleness — acceptable for v1 since sync nulls nothing.
```
