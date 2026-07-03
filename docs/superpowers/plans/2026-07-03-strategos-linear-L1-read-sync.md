# Linear Integration — L1 Read Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sync a real Linear workspace (Projects→Initiatives, Milestones→Epics, Issues→Tasks, Teams, Cycles→velocity) into strategos's program model, recompute risk over it with the real engine, and show it on the dashboard.

**Architecture:** A pure mapping layer (`Linear*` plain shapes → `Raw*`) is unit-tested without network; a thin SDK pull layer adapts `@linear/sdk` objects into those plain shapes; a generic `upsertByRef` reconcile writes them into the model via `ExternalRef` with provenance; a shared `recomputeRisk` (extracted from the seed) scores the synced data through the same `scoreScheduleRisk`/velocity engine. Webhooks and writes are later phases (L2/L3).

**Tech Stack:** Next.js 15, TypeScript strict + `noUncheckedIndexedAccess`, Prisma/Postgres, Vitest, `@linear/sdk`.

## Global Constraints

- TypeScript strict + `noUncheckedIndexedAccess` are ON — guard every array index (`arr[0]` is `T | undefined`).
- Internal imports as `@/…`; Prisma enums/types from `@prisma/client`.
- **Vitest tests must not require a database or network** — test pure functions and mock `@/db` (pattern: `tests/hitl.gate.test.ts`).
- Only outward write path is `writeTicket` via the HITL gate — L1 does NOT implement writes; leave `writeTicket` throwing.
- Config from env: `LINEAR_API_KEY`, `LINEAR_WEBHOOK_SECRET`, `LINEAR_TEAM_KEYS` (comma-separated team keys). `.env.example` already has the first two.
- Mapping (locked): Project→Initiative, Project Milestone→Epic (un-milestoned issues→a per-project "General" epic), Issue→Task, Team→Team, Cycle→VelocitySnapshot, issue blocking relations→Epic dependencies.
- Commit author is configured (Claude / noreply@anthropic.com). Do NOT `git add -A` — the tree has gitignored generated files; stage only files you touch. Quote parenthesized paths in shell.
- All paths are relative to `/Users/richardfernandez/Code/blueprint-projects/strategos`. The dev Postgres (`docker compose up -d`) and `.env` must exist for the manual smoke (Task 10) but not for unit tests.

---

### Task 1: Linear config

**Files:**
- Create: `src/config/linear.ts`
- Test: `tests/linear.config.test.ts`

**Interfaces:**
- Produces: `parseLinearConfig(env: Record<string, string | undefined>): { apiKey: string; webhookSecret: string | null; teamKeys: string[] }` (throws if `LINEAR_API_KEY` missing; `teamKeys` = split/trim/non-empty of `LINEAR_TEAM_KEYS`, `[]` if unset); `linearConfig(): …` reading `process.env`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/linear.config.test.ts
import { describe, it, expect } from "vitest";
import { parseLinearConfig } from "@/config/linear";

describe("parseLinearConfig", () => {
  it("throws when the API key is missing", () => {
    expect(() => parseLinearConfig({})).toThrow(/LINEAR_API_KEY/);
  });
  it("parses key, secret, and team keys", () => {
    const c = parseLinearConfig({ LINEAR_API_KEY: "k", LINEAR_WEBHOOK_SECRET: "s", LINEAR_TEAM_KEYS: "ENG, OPS ,, PLA" });
    expect(c.apiKey).toBe("k");
    expect(c.webhookSecret).toBe("s");
    expect(c.teamKeys).toEqual(["ENG", "OPS", "PLA"]);
  });
  it("defaults secret to null and teamKeys to empty", () => {
    const c = parseLinearConfig({ LINEAR_API_KEY: "k" });
    expect(c.webhookSecret).toBeNull();
    expect(c.teamKeys).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/linear.config.test.ts`
Expected: FAIL — cannot resolve `@/config/linear`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/config/linear.ts
export interface LinearConfig {
  apiKey: string;
  webhookSecret: string | null;
  teamKeys: string[];
}

export function parseLinearConfig(env: Record<string, string | undefined>): LinearConfig {
  const apiKey = env.LINEAR_API_KEY;
  if (!apiKey) throw new Error("LINEAR_API_KEY is not set — cannot sync Linear.");
  const teamKeys = (env.LINEAR_TEAM_KEYS ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k.length > 0);
  return { apiKey, webhookSecret: env.LINEAR_WEBHOOK_SECRET ?? null, teamKeys };
}

export function linearConfig(): LinearConfig {
  return parseLinearConfig(process.env);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/linear.config.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/config/linear.ts tests/linear.config.test.ts
git commit -m "feat(linear): config parsing (api key, webhook secret, team keys)"
```

---

### Task 2: Install @linear/sdk + client factory

**Files:**
- Modify: `package.json` (add `@linear/sdk` via install)
- Create: `src/integrations/linear/client.ts`

**Interfaces:**
- Produces: `linearClient(): LinearClient` — a `@linear/sdk` client built from `linearConfig().apiKey`.

- [ ] **Step 1: Install the SDK**

Run: `npm install @linear/sdk`
Expected: `@linear/sdk` added to dependencies.

- [ ] **Step 2: Write the client factory**

```ts
// src/integrations/linear/client.ts
import { LinearClient } from "@linear/sdk";
import { linearConfig } from "@/config/linear";

// One client per process; throws a clear error if the key is unset.
let client: LinearClient | null = null;
export function linearClient(): LinearClient {
  if (!client) client = new LinearClient({ apiKey: linearConfig().apiKey });
  return client;
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS (exit 0).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/integrations/linear/client.ts
git commit -m "feat(linear): add @linear/sdk + client factory"
```

---

### Task 3: Pure mappers (Linear plain shapes → Raw*)

**Files:**
- Create: `src/integrations/linear/map.ts`
- Test: `tests/linear.map.test.ts`

**Interfaces:**
- Consumes: `RawInitiative`, `RawEpic`, `RawTask`, `DeliveryEvent` from `@/integrations/types`.
- Produces these plain input types (adapter output, no SDK dependency) and mappers:
  - `LinearProject = { id: string; name: string; leadName?: string; targetDate?: string; state?: string }`
  - `LinearMilestone = { id: string; name: string; projectId: string; targetDate?: string }`
  - `LinearIssue = { id: string; title: string; projectId?: string; milestoneId?: string; teamKey?: string; estimate?: number; assigneeName?: string; stateType?: string; stateName?: string; updatedAt?: string; blockedByIssueIds?: string[]; priority?: number }`
  - `LinearCycleDelivery = { teamKey: string; completedPoints: number; committedPoints: number; startsAt: string; endsAt: string }`
  - `mapProject(p): RawInitiative`
  - `mapMilestone(m): RawEpic`
  - `GENERAL_EPIC_SUFFIX = "::general"` and `generalEpicFor(projectId): RawEpic`
  - `mapIssue(i): RawTask`
  - `mapCycle(c): DeliveryEvent`
  - `epicExternalIdForIssue(i: LinearIssue): string` — `i.milestoneId ?? \`${i.projectId}${GENERAL_EPIC_SUFFIX}\``

- [ ] **Step 1: Write the failing test**

```ts
// tests/linear.map.test.ts
import { describe, it, expect } from "vitest";
import { mapProject, mapMilestone, generalEpicFor, mapIssue, mapCycle, epicExternalIdForIssue } from "@/integrations/linear/map";

describe("mapProject", () => {
  it("maps a project to a RawInitiative", () => {
    const r = mapProject({ id: "p1", name: "Checkout", leadName: "A. Kir", targetDate: "2026-09-30", state: "started" });
    expect(r).toEqual({ externalId: "p1", title: "Checkout", owner: "A. Kir", status: "started", targetDate: "2026-09-30" });
  });
});

describe("mapMilestone / generalEpicFor", () => {
  it("maps a milestone to a RawEpic under its project", () => {
    const r = mapMilestone({ id: "m1", name: "Beta", projectId: "p1", targetDate: "2026-08-01" });
    expect(r.externalId).toBe("m1");
    expect(r.initiativeExternalId).toBe("p1");
    expect(r.title).toBe("Beta");
    expect(r.targetDate).toBe("2026-08-01");
  });
  it("builds a stable General epic per project", () => {
    const r = generalEpicFor("p1");
    expect(r.externalId).toBe("p1::general");
    expect(r.initiativeExternalId).toBe("p1");
    expect(r.title).toBe("General");
  });
});

describe("epicExternalIdForIssue", () => {
  it("uses the milestone when present", () => {
    expect(epicExternalIdForIssue({ id: "i", title: "t", projectId: "p1", milestoneId: "m1" })).toBe("m1");
  });
  it("falls back to the project General epic", () => {
    expect(epicExternalIdForIssue({ id: "i", title: "t", projectId: "p1" })).toBe("p1::general");
  });
});

describe("mapIssue", () => {
  it("maps estimate/assignee/state and epic linkage", () => {
    const r = mapIssue({ id: "i1", title: "Fix", projectId: "p1", milestoneId: "m1", teamKey: "ENG", estimate: 5, assigneeName: "R. Cho", stateType: "started", stateName: "In Progress", updatedAt: "2026-06-01", blockedByIssueIds: ["i9"] });
    expect(r.externalId).toBe("i1");
    expect(r.epicExternalId).toBe("m1");
    expect(r.estimatePoints).toBe(5);
    expect(r.assignee).toBe("R. Cho");
    expect(r.status).toBe("started");
  });
});

describe("mapCycle", () => {
  it("maps a cycle delivery to a DeliveryEvent", () => {
    const r = mapCycle({ teamKey: "ENG", completedPoints: 22, committedPoints: 26, startsAt: "2026-06-01", endsAt: "2026-06-15" });
    expect(r).toEqual({ teamKey: "ENG", points: 22, completedAt: "2026-06-15" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/linear.map.test.ts`
Expected: FAIL — cannot resolve `@/integrations/linear/map`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/integrations/linear/map.ts
import type { RawInitiative, RawEpic, RawTask, DeliveryEvent } from "@/integrations/types";

export const GENERAL_EPIC_SUFFIX = "::general";

export interface LinearProject { id: string; name: string; leadName?: string; targetDate?: string; state?: string }
export interface LinearMilestone { id: string; name: string; projectId: string; targetDate?: string }
export interface LinearIssue {
  id: string; title: string; projectId?: string; milestoneId?: string; teamKey?: string;
  estimate?: number; assigneeName?: string; stateType?: string; stateName?: string;
  updatedAt?: string; blockedByIssueIds?: string[]; priority?: number;
}
export interface LinearCycleDelivery { teamKey: string; completedPoints: number; committedPoints: number; startsAt: string; endsAt: string }

export function mapProject(p: LinearProject): RawInitiative {
  return { externalId: p.id, title: p.name, owner: p.leadName, status: p.state ?? "unknown", targetDate: p.targetDate };
}

export function mapMilestone(m: LinearMilestone): RawEpic {
  return { externalId: m.id, initiativeExternalId: m.projectId, title: m.name, status: "active", targetDate: m.targetDate };
}

export function generalEpicFor(projectId: string): RawEpic {
  return { externalId: `${projectId}${GENERAL_EPIC_SUFFIX}`, initiativeExternalId: projectId, title: "General", status: "active" };
}

export function epicExternalIdForIssue(i: LinearIssue): string {
  return i.milestoneId ?? `${i.projectId ?? "orphan"}${GENERAL_EPIC_SUFFIX}`;
}

export function mapIssue(i: LinearIssue): RawTask {
  return {
    externalId: i.id,
    epicExternalId: epicExternalIdForIssue(i),
    title: i.title,
    status: i.stateType ?? "unknown",
    estimatePoints: i.estimate,
    assignee: i.assigneeName,
    updatedAt: i.updatedAt,
  };
}

export function mapCycle(c: LinearCycleDelivery): DeliveryEvent {
  return { teamKey: c.teamKey, points: c.completedPoints, completedAt: c.endsAt };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/linear.map.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/integrations/linear/map.ts tests/linear.map.test.ts
git commit -m "feat(linear): pure mappers Linear shapes -> Raw* (milestone epics, General fallback)"
```

---

### Task 4: SDK pull layer

**Files:**
- Create: `src/integrations/linear/pull.ts`

**Interfaces:**
- Consumes: `linearClient` (Task 2); the `Linear*` shapes + mappers (Task 3); `PullSince`, `PullResult`, `RawInitiative/RawEpic/RawTask/DeliveryEvent` from `@/integrations/types`.
- Produces: `pullProjects(teamKeys: string[]): Promise<RawInitiative[]>`, `pullMilestones(teamKeys): Promise<RawEpic[]>`, `pullIssues(teamKeys): Promise<RawTask[]>`, `pullDelivery(teamKeys): Promise<DeliveryEvent[]>`. Each paginates `.nodes`/`pageInfo` and adapts SDK objects into the `Linear*` shapes before mapping.

Note to implementer: this is the one task that touches the live `@linear/sdk`. Field names below reflect the SDK's connection model (`.nodes`, `.pageInfo.hasNextPage`, `.pageInfo.endCursor`, `{ first, after }`) and lazy relations (e.g. `issue.assignee` is a promise-like/fetchable). Verify exact property/relation names against the installed `@linear/sdk` types as you go — `npm run typecheck` is the gate. Keep the SDK contained to THIS file; everything downstream consumes `Raw*`.

- [ ] **Step 1: Implement the pull layer**

```ts
// src/integrations/linear/pull.ts
import type { RawInitiative, RawEpic, RawTask, DeliveryEvent } from "@/integrations/types";
import { linearClient } from "@/integrations/linear/client";
import {
  mapProject, mapMilestone, generalEpicFor, mapIssue, mapCycle,
  type LinearProject, type LinearMilestone, type LinearIssue, type LinearCycleDelivery,
} from "@/integrations/linear/map";
import { log } from "@/logger";

const logger = log.child({ integration: "linear", op: "pull" });
const PAGE = 100;

// Walk a Linear connection to completion. `fetchPage` returns { nodes, pageInfo }.
async function collect<T>(fetchPage: (after?: string) => Promise<{ nodes: T[]; pageInfo: { hasNextPage: boolean; endCursor?: string | null } }>): Promise<T[]> {
  const out: T[] = [];
  let after: string | undefined;
  for (;;) {
    const page = await fetchPage(after);
    out.push(...page.nodes);
    if (!page.pageInfo.hasNextPage || !page.pageInfo.endCursor) break;
    after = page.pageInfo.endCursor;
  }
  return out;
}

// Projects for the configured teams. A Linear project can belong to several
// teams; we include it if any of its teams is configured.
export async function pullProjects(teamKeys: string[]): Promise<RawInitiative[]> {
  const client = linearClient();
  const projects = await collect((after) => client.projects({ first: PAGE, after }));
  const raw: LinearProject[] = [];
  for (const p of projects) {
    const teams = await p.teams();
    const keys = teams.nodes.map((t) => t.key);
    if (teamKeys.length && !keys.some((k) => teamKeys.includes(k))) continue;
    const lead = p.lead ? await p.lead : undefined;
    raw.push({ id: p.id, name: p.name, leadName: lead?.name, targetDate: p.targetDate ?? undefined, state: p.state ?? undefined });
  }
  logger.info("pulled projects", { count: raw.length });
  return raw.map(mapProject);
}

// Milestones for the in-scope projects (same team filter as projects).
export async function pullMilestones(teamKeys: string[]): Promise<RawEpic[]> {
  const client = linearClient();
  const projects = await collect((after) => client.projects({ first: PAGE, after }));
  const epics: RawEpic[] = [];
  for (const p of projects) {
    const teams = await p.teams();
    const keys = teams.nodes.map((t) => t.key);
    if (teamKeys.length && !keys.some((k) => teamKeys.includes(k))) continue;
    // one General epic per project for un-milestoned issues
    epics.push(generalEpicFor(p.id));
    const milestones = await p.projectMilestones();
    for (const m of milestones.nodes) {
      const raw: LinearMilestone = { id: m.id, name: m.name, projectId: p.id, targetDate: m.targetDate ?? undefined };
      epics.push(mapMilestone(raw));
    }
  }
  logger.info("pulled milestones", { count: epics.length });
  return epics;
}

// Issues for the configured teams.
export async function pullIssues(teamKeys: string[]): Promise<RawTask[]> {
  const client = linearClient();
  const issues = await collect((after) => client.issues({ first: PAGE, after }));
  const raw: LinearIssue[] = [];
  for (const i of issues) {
    const team = i.team ? await i.team : undefined;
    if (teamKeys.length && (!team || !teamKeys.includes(team.key))) continue;
    const project = i.project ? await i.project : undefined;
    const milestone = i.projectMilestone ? await i.projectMilestone : undefined;
    const assignee = i.assignee ? await i.assignee : undefined;
    const state = i.state ? await i.state : undefined;
    raw.push({
      id: i.id, title: i.title, projectId: project?.id, milestoneId: milestone?.id, teamKey: team?.key,
      estimate: i.estimate ?? undefined, assigneeName: assignee?.name,
      stateType: state?.type, stateName: state?.name, updatedAt: i.updatedAt?.toISOString(), priority: i.priority,
    });
  }
  logger.info("pulled issues", { count: raw.length });
  // Only issues that belong to a project map cleanly; drop the rest (inbox/triage).
  return raw.filter((i) => i.projectId).map(mapIssue);
}

// Completed cycles → per-team delivery for velocity.
export async function pullDelivery(teamKeys: string[]): Promise<DeliveryEvent[]> {
  const client = linearClient();
  const cycles = await collect((after) => client.cycles({ first: PAGE, after }));
  const out: LinearCycleDelivery[] = [];
  for (const c of cycles) {
    const team = c.team ? await c.team : undefined;
    if (!team) continue;
    if (teamKeys.length && !teamKeys.includes(team.key)) continue;
    if (!c.endsAt || c.endsAt.getTime() > Date.now()) continue; // completed cycles only
    out.push({
      teamKey: team.key,
      completedPoints: c.completedScopeHistory?.at(-1) ?? 0,
      committedPoints: c.scopeHistory?.at(-1) ?? 0,
      startsAt: c.startsAt.toISOString(),
      endsAt: c.endsAt.toISOString(),
    });
  }
  logger.info("pulled delivery", { count: out.length });
  return out.map(mapCycle);
}
```

- [ ] **Step 2: Typecheck (adjust SDK field names if the compiler flags them)**

Run: `npm run typecheck`
Expected: PASS (exit 0). If a property/relation name is wrong for the installed SDK version, fix it to the compiler-suggested name — the mapping layer contract (`Raw*`) must not change, only the SDK adapter.

- [ ] **Step 3: Commit**

```bash
git add src/integrations/linear/pull.ts
git commit -m "feat(linear): SDK pull layer (projects/milestones/issues/cycles, paginated, team-scoped)"
```

---

### Task 5: Wire LinearIntegration.pull*

**Files:**
- Modify: `src/integrations/linear/index.ts`

**Interfaces:**
- Consumes: the pull functions (Task 4). The `Integration` port's `pull*` take `PullSince` and return `PullResult<T>`; L1 ignores the cursor (full pull) and returns `{ items, nextCursor: null }`.
- Produces: `LinearIntegration` whose `pullInitiatives/pullEpics/pullTasks/pullDeliveryHistory` return real data. `verifyWebhook`/`parseWebhook`/`writeTicket` stay stubbed (L2/L3).

- [ ] **Step 1: Replace the read stubs**

Replace the four `pull*` method bodies (keep the class shape, the `kind`, and the webhook/write stubs as-is):

```ts
// src/integrations/linear/index.ts  (pull* methods only)
import { linearConfig } from "@/config/linear";
import { pullProjects, pullMilestones, pullIssues, pullDelivery } from "@/integrations/linear/pull";
// ...existing imports (IntegrationKind, Integration/PullSince/PullResult/Raw*, log) stay...

  async pullInitiatives(_since: PullSince): Promise<PullResult<RawInitiative>> {
    const items = await pullProjects(linearConfig().teamKeys);
    return { items, nextCursor: null };
  }

  async pullEpics(_since: PullSince): Promise<PullResult<RawEpic>> {
    const items = await pullMilestones(linearConfig().teamKeys);
    return { items, nextCursor: null };
  }

  async pullTasks(_since: PullSince): Promise<PullResult<RawTask>> {
    const items = await pullIssues(linearConfig().teamKeys);
    return { items, nextCursor: null };
  }

  async pullDeliveryHistory(_since: PullSince): Promise<PullResult<DeliveryEvent>> {
    const items = await pullDelivery(linearConfig().teamKeys);
    return { items, nextCursor: null };
  }
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS (exit 0).

- [ ] **Step 3: Commit**

```bash
git add src/integrations/linear/index.ts
git commit -m "feat(linear): wire pull* into LinearIntegration (reads live; writes still gated-stub)"
```

---

### Task 6: Generic reconcile (`upsertByRef` + entity reconcilers)

**Files:**
- Create: `src/state/sync/reconcile.ts`
- Test: `tests/reconcile.test.ts`

**Interfaces:**
- Consumes: `db` from `@/db`; `recordChange` from `@/state/versioned/provenance`; `Raw*` types.
- Produces:
  - `upsertByRef<TRow>(args: { kind: IntegrationKind; externalId: string; entityType: string; load: () => Promise<TRow | null>; create: () => Promise<TRow>; update: (row: TRow) => Promise<TRow>; changed: (row: TRow) => boolean; source: string }): Promise<{ row: TRow; changed: boolean }>` — resolves the row by `ExternalRef`; creates + links a fresh `ExternalRef` if absent; updates + `recordChange` if `changed(row)`.
  - `refExternalId(kind, externalId): Promise<string | null>` — returns the linked strategos row id, or null.

The test asserts create-path (no ref → create + ExternalRef), update-path (ref exists + changed → update + recordChange), and no-op path (ref exists + unchanged → no recordChange).

- [ ] **Step 1: Write the failing test**

```ts
// tests/reconcile.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const calls: Record<string, number> = { create: 0, update: 0, recordChange: 0, refCreate: 0 };
const refs = new Map<string, string>(); // `${kind}:${externalId}` -> rowId

vi.mock("@/db", () => ({
  db: {
    externalRef: {
      findUnique: vi.fn(async ({ where }: { where: { kind_externalId: { kind: string; externalId: string } } }) => {
        const k = `${where.kind_externalId.kind}:${where.kind_externalId.externalId}`;
        return refs.has(k) ? { id: "ref", initiativeId: refs.get(k) } : null;
      }),
      create: vi.fn(async ({ data }: { data: { kind: string; externalId: string; initiativeId?: string } }) => {
        calls.refCreate++; refs.set(`${data.kind}:${data.externalId}`, data.initiativeId ?? "row-new"); return { id: "ref" };
      }),
    },
  },
}));
vi.mock("@/state/versioned/provenance", () => ({ recordChange: vi.fn(async () => { calls.recordChange++; }) }));

import { upsertByRef } from "@/state/sync/reconcile";

beforeEach(() => { calls.create = calls.update = calls.recordChange = calls.refCreate = 0; refs.clear(); });

describe("upsertByRef", () => {
  it("creates the row and an ExternalRef when none exists", async () => {
    const res = await upsertByRef({
      kind: "LINEAR", externalId: "p1", entityType: "Initiative",
      load: async () => null,
      create: async () => { calls.create++; return { id: "row-new" }; },
      update: async (r) => { calls.update++; return r; },
      changed: () => false, source: "sync:linear",
    });
    expect(calls.create).toBe(1);
    expect(calls.refCreate).toBe(1);
    expect(res.row.id).toBe("row-new");
  });

  it("updates + records a change when the ref exists and the row changed", async () => {
    refs.set("LINEAR:p1", "row-1");
    await upsertByRef({
      kind: "LINEAR", externalId: "p1", entityType: "Initiative",
      load: async () => ({ id: "row-1" }),
      create: async () => { calls.create++; return { id: "x" }; },
      update: async (r) => { calls.update++; return r; },
      changed: () => true, source: "sync:linear",
    });
    expect(calls.create).toBe(0);
    expect(calls.update).toBe(1);
    expect(calls.recordChange).toBe(1);
  });

  it("does nothing extra when the row is unchanged", async () => {
    refs.set("LINEAR:p1", "row-1");
    await upsertByRef({
      kind: "LINEAR", externalId: "p1", entityType: "Initiative",
      load: async () => ({ id: "row-1" }),
      create: async () => ({ id: "x" }),
      update: async (r) => { calls.update++; return r; },
      changed: () => false, source: "sync:linear",
    });
    expect(calls.update).toBe(0);
    expect(calls.recordChange).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/reconcile.test.ts`
Expected: FAIL — cannot resolve `@/state/sync/reconcile`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/state/sync/reconcile.ts
import type { IntegrationKind } from "@prisma/client";
import { db } from "@/db";
import { recordChange } from "@/state/versioned/provenance";

// The single reconcile primitive: identity via ExternalRef, then create-or-diff.
// entityType is one of the ExternalRef relation columns ("Initiative" | "Epic" | "Task").
const REL: Record<string, "initiativeId" | "epicId" | "taskId"> = {
  Initiative: "initiativeId", Epic: "epicId", Task: "taskId",
};

export async function upsertByRef<TRow extends { id: string }>(args: {
  kind: IntegrationKind;
  externalId: string;
  entityType: "Initiative" | "Epic" | "Task";
  load: () => Promise<TRow | null>;
  create: () => Promise<TRow>;
  update: (row: TRow) => Promise<TRow>;
  changed: (row: TRow) => boolean;
  source: string;
}): Promise<{ row: TRow; changed: boolean }> {
  const existing = await args.load();
  if (!existing) {
    const row = await args.create();
    await db.externalRef.create({
      data: { kind: args.kind, externalId: args.externalId, [REL[args.entityType]]: row.id },
    });
    return { row, changed: true };
  }
  if (args.changed(existing)) {
    const row = await args.update(existing);
    await recordChange({ entityType: args.entityType, entityId: existing.id, field: "sync", before: existing, after: row, source: args.source });
    return { row, changed: true };
  }
  return { row: existing, changed: false };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/reconcile.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/state/sync/reconcile.ts tests/reconcile.test.ts
git commit -m "feat(sync): generic upsertByRef reconcile primitive (identity + diff + provenance)"
```

---

### Task 7: Extract `recomputeRisk` (shared by seed + sync)

**Files:**
- Create: `src/state/model/recompute.ts`
- Modify: `prisma/seed.ts` (call `recomputeRisk` instead of inline scoring)
- Test: `tests/recompute.test.ts`

**Interfaces:**
- Consumes: `db`; `scoreScheduleRisk` from `@/agents/risk/scoring`; `velocityPerSprint` from `@/agents/risk/velocity`.
- Produces: `recomputeRisk(programId: string): Promise<{ scored: number }>` — for each initiative in the program, delete its prior SCHEDULE `RiskScore` rows, compute `remainingPoints` (non-DONE task points across its epics), `velocityPerSprint` from the epics' team snapshots, `sprintsRemaining` from `targetDate`, and upsert a fresh SCHEDULE `RiskScore` from `scoreScheduleRisk`. Pure scoring math is delegated to the existing engine.
- Also exports the pure helper `sprintsUntil(targetDate: Date | null, now: number): number` (0 if null/past; ceil of ms/(14 days)).

- [ ] **Step 1: Write the failing test (pure helper + engine wiring shape)**

```ts
// tests/recompute.test.ts
import { describe, it, expect } from "vitest";
import { sprintsUntil } from "@/state/model/recompute";

const DAY = 24 * 60 * 60 * 1000;

describe("sprintsUntil", () => {
  it("is 0 for a null or past date", () => {
    expect(sprintsUntil(null, 1000)).toBe(0);
    expect(sprintsUntil(new Date(500), 1000)).toBe(0);
  });
  it("ceils to 14-day sprints", () => {
    const now = 0;
    expect(sprintsUntil(new Date(20 * DAY), now)).toBe(2); // 20d -> 2 sprints
    expect(sprintsUntil(new Date(14 * DAY), now)).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/recompute.test.ts`
Expected: FAIL — cannot resolve `@/state/model/recompute`.

- [ ] **Step 3: Write the implementation**

```ts
// src/state/model/recompute.ts
import { db } from "@/db";
import { scoreScheduleRisk } from "@/agents/risk/scoring";
import { velocityPerSprint } from "@/agents/risk/velocity";

const SPRINT_MS = 14 * 24 * 60 * 60 * 1000;

export function sprintsUntil(targetDate: Date | null, now: number): number {
  if (!targetDate) return 0;
  const ms = targetDate.getTime() - now;
  return ms <= 0 ? 0 : Math.ceil(ms / SPRINT_MS);
}

// Recompute SCHEDULE risk for every initiative in a program using the real
// engine over whatever facts are currently in the model (seed OR live sync).
export async function recomputeRisk(programId: string): Promise<{ scored: number }> {
  const now = Date.now();
  const initiatives = await db.initiative.findMany({
    where: { programId },
    include: { epics: { include: { tasks: { select: { status: true, estimatePoints: true } }, } } },
  });

  let scored = 0;
  for (const init of initiatives) {
    const tasks = init.epics.flatMap((e) => e.tasks);
    const remainingPoints = tasks.filter((t) => t.status !== "DONE").reduce((s, t) => s + (t.estimatePoints ?? 0), 0);

    // velocity: mean per-sprint completed points across the initiative's teams
    const teamIds = [...new Set(init.epics.map((e) => e.teamId).filter((x): x is string => !!x))];
    const snapshots = teamIds.length
      ? await db.velocitySnapshot.findMany({ where: { teamId: { in: teamIds } }, orderBy: { periodStart: "asc" }, select: { completedPts: true } })
      : [];
    const perSprint = velocityPerSprint(snapshots.map((s) => s.completedPts));

    const risk = scoreScheduleRisk({ remainingPoints, velocityPerSprint: perSprint, sprintsRemaining: sprintsUntil(init.targetDate, now) });

    await db.riskScore.deleteMany({ where: { initiativeId: init.id, kind: "SCHEDULE" } });
    await db.riskScore.create({
      data: {
        initiativeId: init.id, kind: "SCHEDULE", severity: risk.severity, score: risk.score,
        confidence: 0.8, explanation: risk.explanation,
        mitigation: risk.willSlip ? "Re-scope or add capacity next sprint." : undefined,
        escalated: risk.severity === "CRITICAL",
      },
    });
    scored++;
  }
  return { scored };
}
```

- [ ] **Step 4: Refactor the seed to use it**

In `prisma/seed.ts`, replace the inline per-initiative `scoreScheduleRisk` + `db.riskScore.create` loop (the SCHEDULE risk block) with a single call after the initiatives/tasks/velocity are created:

```ts
// prisma/seed.ts — add to the imports at the top (the seed uses relative imports, like `../src/db`):
import { recomputeRisk } from "../src/state/model/recompute";
// ...then, after initiatives+epics+tasks+velocity are created and BEFORE the hand-set
// DEPENDENCY risk + the HITL proposals, replace the inline per-initiative SCHEDULE
// scoring loop with a single call:
await recomputeRisk(program.id);
```

Keep the hand-set DEPENDENCY risk and the HITL proposals as-is. Re-run the seed and confirm the counts are unchanged: `{ initiatives: 9, risks: 10, proposals: 3 }` (9 SCHEDULE from `recomputeRisk` + 1 DEPENDENCY).

- [ ] **Step 5: Run tests + reseed to verify parity**

Run: `npm test -- tests/recompute.test.ts && npm run db:seed`
Expected: tests PASS; seed prints `Seeded Payments Platform: { initiatives: 9, risks: 10, proposals: 3 }` (needs Postgres up).

- [ ] **Step 6: Commit**

```bash
git add src/state/model/recompute.ts prisma/seed.ts tests/recompute.test.ts
git commit -m "refactor(risk): extract recomputeRisk shared by seed + sync"
```

---

### Task 8: syncEngine orchestration (pull → reconcile → recompute)

**Files:**
- Modify: `src/state/sync/syncEngine.ts` (replace the placeholder body)
- Create: `src/state/sync/program.ts` (resolve/create the program for the configured teams)

**Interfaces:**
- Consumes: `integrationFor` from `@/integrations/registry`; `upsertByRef`, `refExternalId` (Task 6); `recomputeRisk` (Task 7); `linearConfig` (Task 1); `Raw*` types; `db`.
- Produces: `syncIntegration(kind): Promise<{ initiatives: number; epics: number; tasks: number; velocity: number; scored: number }>` and `resolveProgram(kind): Promise<string>` (get-or-create a Program named after the kind + team scope; returns its id).

Note: this task wires the reconcilers using `upsertByRef` for each entity type, mapping `Raw*` → Prisma create/update. It is integration-shaped; the gate is `npm run typecheck` plus the Task 10 manual smoke. The per-entity `changed()` comparisons should compare the handful of synced fields (title/owner/status/targetDate for initiatives, etc.).

- [ ] **Step 1: Program resolver**

```ts
// src/state/sync/program.ts
import type { IntegrationKind } from "@prisma/client";
import { db } from "@/db";
import { linearConfig } from "@/config/linear";

// One program per (kind + configured team scope). Idempotent by a synthetic
// ExternalRef so re-syncs reuse the same program.
export async function resolveProgram(kind: IntegrationKind): Promise<string> {
  const scope = kind === "LINEAR" ? linearConfig().teamKeys.join(",") || "all" : "all";
  const externalId = `program:${kind}:${scope}`;
  const ref = await db.externalRef.findUnique({ where: { kind_externalId: { kind, externalId } } });
  if (ref?.initiativeId) {
    const init = await db.initiative.findUnique({ where: { id: ref.initiativeId }, select: { programId: true } });
    if (init) return init.programId;
  }
  // Not found via a ref anchor — create a program and anchor it with a sentinel initiative-less ref is not possible,
  // so store the program id on a dedicated SyncCursor row instead.
  const cursor = await db.syncCursor.findUnique({ where: { kind_resource: { kind, resource: "__program__" } } });
  if (cursor?.cursor) return cursor.cursor;
  const program = await db.program.create({ data: { name: `${kind} — ${scope}` } });
  await db.syncCursor.upsert({
    where: { kind_resource: { kind, resource: "__program__" } },
    create: { kind, resource: "__program__", cursor: program.id, lastSynced: new Date() },
    update: { cursor: program.id },
  });
  return program.id;
}
```

- [ ] **Step 2: Rewrite syncEngine**

```ts
// src/state/sync/syncEngine.ts
import type { IntegrationKind } from "@prisma/client";
import { db } from "@/db";
import { integrationFor } from "@/integrations/registry";
import { upsertByRef } from "@/state/sync/reconcile";
import { resolveProgram } from "@/state/sync/program";
import { recomputeRisk } from "@/state/model/recompute";
import { log } from "@/logger";

export async function syncIntegration(kind: IntegrationKind) {
  const logger = log.child({ op: "sync", integration: kind });
  const integration = integrationFor(kind);
  const programId = await resolveProgram(kind);
  const source = `sync:${kind.toLowerCase()}`;

  // Initiatives (Projects)
  const { items: inits } = await integration.pullInitiatives({});
  for (const raw of inits) {
    await upsertByRef({
      kind, externalId: raw.externalId, entityType: "Initiative", source,
      load: async () => {
        const ref = await db.externalRef.findUnique({ where: { kind_externalId: { kind, externalId: raw.externalId } } });
        return ref?.initiativeId ? db.initiative.findUnique({ where: { id: ref.initiativeId } }) : null;
      },
      create: () => db.initiative.create({ data: { programId, title: raw.title, owner: raw.owner, status: "IN_PROGRESS", targetDate: raw.targetDate ? new Date(raw.targetDate) : null } }),
      update: (row) => db.initiative.update({ where: { id: row.id }, data: { title: raw.title, owner: raw.owner, targetDate: raw.targetDate ? new Date(raw.targetDate) : null } }),
      changed: (row) => row.title !== raw.title || (row.owner ?? undefined) !== raw.owner,
    });
  }

  // Epics (Milestones + General) — resolve parent initiative via its ExternalRef
  const { items: epics } = await integration.pullEpics({});
  for (const raw of epics) {
    const parentRef = raw.initiativeExternalId
      ? await db.externalRef.findUnique({ where: { kind_externalId: { kind, externalId: raw.initiativeExternalId } } })
      : null;
    if (!parentRef?.initiativeId) continue; // parent project out of scope
    await upsertByRef({
      kind, externalId: raw.externalId, entityType: "Epic", source,
      load: async () => {
        const ref = await db.externalRef.findUnique({ where: { kind_externalId: { kind, externalId: raw.externalId } } });
        return ref?.epicId ? db.epic.findUnique({ where: { id: ref.epicId } }) : null;
      },
      create: () => db.epic.create({ data: { initiativeId: parentRef.initiativeId!, title: raw.title, status: "IN_PROGRESS", targetDate: raw.targetDate ? new Date(raw.targetDate) : null } }),
      update: (row) => db.epic.update({ where: { id: row.id }, data: { title: raw.title } }),
      changed: (row) => row.title !== raw.title,
    });
  }

  // Tasks (Issues) — resolve parent epic via its ExternalRef
  const { items: tasks } = await integration.pullTasks({});
  for (const raw of tasks) {
    const epicRef = raw.epicExternalId
      ? await db.externalRef.findUnique({ where: { kind_externalId: { kind, externalId: raw.epicExternalId } } })
      : null;
    if (!epicRef?.epicId) continue;
    const doneish = raw.status === "completed" || raw.status === "canceled";
    await upsertByRef({
      kind, externalId: raw.externalId, entityType: "Task", source,
      load: async () => {
        const ref = await db.externalRef.findUnique({ where: { kind_externalId: { kind, externalId: raw.externalId } } });
        return ref?.taskId ? db.task.findUnique({ where: { id: ref.taskId } }) : null;
      },
      create: () => db.task.create({ data: { epicId: epicRef.epicId!, title: raw.title, status: doneish ? "DONE" : "IN_PROGRESS", estimatePoints: raw.estimatePoints ?? null, assignee: raw.assignee ?? null } }),
      update: (row) => db.task.update({ where: { id: row.id }, data: { title: raw.title, status: doneish ? "DONE" : "IN_PROGRESS", estimatePoints: raw.estimatePoints ?? null, assignee: raw.assignee ?? null } }),
      changed: (row) => row.title !== raw.title || (row.status === "DONE") !== doneish || (row.estimatePoints ?? null) !== (raw.estimatePoints ?? null),
    });
  }

  // Velocity (Cycles) — one snapshot per (team,cycle); teams resolved by name
  const { items: delivery } = await integration.pullDeliveryHistory({});
  let velocity = 0;
  for (const d of delivery) {
    const team = await db.team.upsert({
      where: { id: `team:${kind}:${d.teamKey}` },
      create: { id: `team:${kind}:${d.teamKey}`, programId, name: d.teamKey },
      update: {},
    });
    await db.velocitySnapshot.create({
      data: { teamId: team.id, periodStart: new Date(d.completedAt), periodEnd: new Date(d.completedAt), completedPts: d.points, committedPts: d.points },
    });
    velocity++;
  }

  const { scored } = await recomputeRisk(programId);
  const out = { initiatives: inits.length, epics: epics.length, tasks: tasks.length, velocity, scored };
  logger.info("sync complete", out);
  return out;
}

export async function syncAll(): Promise<Record<string, unknown>> {
  const kinds: IntegrationKind[] = ["LINEAR", "GITHUB", "JIRA", "GITLAB", "AZURE_DEVOPS"];
  const out: Record<string, unknown> = {};
  for (const kind of kinds) {
    try { out[kind] = await syncIntegration(kind); }
    catch (err) { log.error("sync failed", { kind, err: String(err) }); out[kind] = { error: String(err) }; }
  }
  return out;
}
```

Note: the velocity block associates snapshots with `team:<kind>:<key>` teams. Epics created above don't yet set `teamId` (the milestone→team mapping needs the issues' teams); for L1, `recomputeRisk` tolerates epics without a team (velocity falls back to 0 → conservative risk). Wiring `Epic.teamId` from the dominant issue team is a documented refinement (see Task 10 notes), not required for L1's "real data on the dashboard" outcome.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS (exit 0).

- [ ] **Step 4: Commit**

```bash
git add src/state/sync/syncEngine.ts src/state/sync/program.ts
git commit -m "feat(sync): syncEngine orchestration — pull, reconcile every entity, recompute risk"
```

---

### Task 9: Dashboard prefers the synced program (+ switcher)

**Files:**
- Modify: `src/state/model/repository.ts` (`firstProgramId` → prefer the real/synced program; keep a fallback)
- Modify: `src/components/ui/Sidebar.tsx` (program chip → a simple switcher listing programs)
- Create: `app/(dash)/actions-program.ts` — a server action to set the active program via a cookie (optional switcher target)

**Interfaces:**
- Produces: `programModel.primaryProgramId(): Promise<string | null>` — returns the most-recently-created program that has a `__program__` SyncCursor (i.e. synced), else the oldest program (the seed). The Overview and secondary pages call `primaryProgramId()` instead of `firstProgramId()`.

- [ ] **Step 1: Add `primaryProgramId` (prefer synced)**

```ts
// src/state/model/repository.ts — add to programModel
  async primaryProgramId(): Promise<string | null> {
    // A program created by sync is anchored by a "__program__" SyncCursor whose cursor = programId.
    const syncedCursors = await db.syncCursor.findMany({ where: { resource: "__program__" }, orderBy: { updatedAt: "desc" } });
    for (const c of syncedCursors) {
      if (c.cursor) {
        const p = await db.program.findUnique({ where: { id: c.cursor }, select: { id: true } });
        if (p) return p.id;
      }
    }
    const oldest = await db.program.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
    return oldest?.id ?? null;
  },
```

- [ ] **Step 2: Point the pages at it**

In `app/(dash)/page.tsx`, `app/(dash)/initiatives/page.tsx`, `app/(dash)/risks/page.tsx`, `app/(dash)/sprints/page.tsx`, replace `programModel.firstProgramId()` with `programModel.primaryProgramId()`. (Audit/Communications are program-agnostic — leave them.)

- [ ] **Step 3: Sidebar shows the active program name**

In `src/components/ui/Sidebar.tsx`, the `programName` prop already renders the chip. Change `app/(dash)/layout.tsx` to look up the primary program's name and pass it:

```tsx
// app/(dash)/layout.tsx
import { Sidebar } from "@/components/ui/Sidebar";
import { programModel } from "@/state/model/repository";
import { db } from "@/db";

export default async function DashLayout({ children }: { children: React.ReactNode }) {
  const pid = await programModel.primaryProgramId();
  const program = pid ? await db.program.findUnique({ where: { id: pid }, select: { name: true } }) : null;
  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar programName={program?.name ?? "No program"} />
      <main style={{ flex: 1, padding: "18px 22px" }}>{children}</main>
    </div>
  );
}
```

(A full multi-program click-to-switch UI is deferred; L1 shows the synced program's name and renders its data. Note this scope choice in the report.)

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS (exit 0).

- [ ] **Step 5: Commit**

```bash
git add src/state/model/repository.ts "app/(dash)/page.tsx" "app/(dash)/initiatives/page.tsx" "app/(dash)/risks/page.tsx" "app/(dash)/sprints/page.tsx" "app/(dash)/layout.tsx"
git commit -m "feat(dash): prefer the synced program (primaryProgramId) + show its name"
```

---

### Task 10: Env docs + manual smoke + full verification

**Files:**
- Modify: `.env.example` (add `LINEAR_TEAM_KEYS`)
- Create: `docs/linear-sync.md` (how to run a real sync)

- [ ] **Step 1: Document the env + a runnable sync entrypoint**

Add to `.env.example` under the Linear section: `LINEAR_TEAM_KEYS=` (comma-separated team keys to sync; empty = all teams).

Create `docs/linear-sync.md`:

```markdown
# Running a Linear sync (L1)

1. Set in `.env`: `LINEAR_API_KEY` (Linear → Settings → API → Personal API key), and optionally `LINEAR_TEAM_KEYS=ENG,OPS`.
2. Start Postgres: `docker compose up -d`, apply migrations: `npx prisma migrate dev`.
3. Run a one-off sync:
   `npx tsx -e "import 'dotenv/config'; import { syncIntegration } from './src/state/sync/syncEngine'; syncIntegration('LINEAR').then(r => { console.log(r); process.exit(0); });"`
4. Start the app (`npm run dev`) and open http://localhost:3000 — the dashboard shows the synced Linear program (its projects as initiatives, milestones as epics, issues as tasks), with risk recomputed by the engine.
```

- [ ] **Step 2: Full automated verification**

Run: `npm run lint && npm run typecheck && npm test`
Expected: lint 0 errors; typecheck clean; tests pass (existing 23 + linear.config 3 + linear.map 7 + reconcile 3 + recompute 2 = 38).

- [ ] **Step 3: Manual smoke (requires a real LINEAR_API_KEY + Postgres)**

Run the sync command from `docs/linear-sync.md` step 3.
Expected: prints `{ initiatives: N, epics: M, tasks: K, velocity: V, scored: N }` with N>0 for a non-empty workspace; the dashboard renders the synced program. If no key is available, note this step as skipped in the report (do NOT fake it).

- [ ] **Step 4: Commit**

```bash
git add .env.example docs/linear-sync.md
git commit -m "docs(linear): env + manual sync runbook; L1 read-sync complete"
```

---

## Self-Review notes (author)

- **Spec coverage (L1 slice):** config (T1) · SDK client (T2) · mapping incl. milestone-epics + General fallback (T3) · paginated team-scoped pull (T4) · LinearIntegration reads live (T5) · generalized `upsertByRef` reconcile with provenance (T6) · shared `recomputeRisk` seed+sync (T7) · orchestration create/Program/reconcile/velocity/recompute (T8) · dashboard prefers synced program (T9) · env + runbook + verification (T10). Webhooks (L2) and writes (L3) are explicitly out of this plan.
- **Type consistency:** `Raw*` shapes are the single contract between pull (T4) and reconcile (T8); `upsertByRef` signature (T6) is used verbatim in T8; `recomputeRisk(programId)` (T7) is called by both the seed (T7) and syncEngine (T8); `primaryProgramId` (T9) replaces `firstProgramId` at the four program-scoped pages.
- **Known L1 simplifications (documented, not gaps):** `Epic.teamId` is not populated from the dominant issue team in L1 (velocity falls back to 0 → conservative risk); DEPENDENCY/BLOCKER/TEAM risk kinds beyond SCHEDULE are recomputed only for the seed's hand-set dependency, not derived from synced Linear relations (that's an L1.5/L2 refinement); the program "switcher" shows the active program name without click-to-switch. Each is called out in the relevant task.
- **DB-touching tasks (T8, parts of T7/T9)** are gated by typecheck + the T10 manual smoke rather than unit tests, consistent with the project's "tests must not require a DB" constraint; the pure/mocked cores (T1, T3, T6, T7 helper) are unit-tested.
