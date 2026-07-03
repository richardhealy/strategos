# Linear Integration — L3 Writes (through HITL) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an APPROVED `TICKET_WRITE` proposal create or update a real Linear issue — routed through the existing HITL gate, which stays the single outward-action choke point.

**Architecture:** A pure `buildIssueMutation` validates/normalizes the proposal payload; `LinearIntegration.writeTicket` performs the SDK create/update; the gate's `TICKET_WRITE` effect routes to `integrationFor(kind).writeTicket`. Nothing fires without human approval (the gate's `apply` refuses non-APPROVED proposals — pinned by the existing adversarial test).

**Tech Stack:** Next.js 15, TypeScript strict, `@linear/sdk`, Vitest.

## Global Constraints

- TypeScript strict + `noUncheckedIndexedAccess` ON; concrete-keyed literals for test accumulators.
- Internal imports as `@/…`; Prisma enums from `@prisma/client`.
- Vitest tests must not require a database or network — test the pure builder and the routing (mock `@/integrations/registry`).
- The outward write path stays reachable ONLY via the HITL gate → `apply` → effect → `writeTicket`. Do not add any other call site.
- `TICKET_WRITE` proposal payload shape: `{ kind: IntegrationKind, action: "create" | "update", issue: { teamId?, id?, title?, description?, stateId? } }`. create requires `issue.teamId` + `issue.title`; update requires `issue.id`.
- Paths relative to `/Users/richardfernandez/Code/blueprint-projects/strategos`. Commit author configured; do NOT `git add -A`.

## Scope / non-goals

- **In:** `buildIssueMutation`, `LinearIntegration.writeTicket` (SDK create/update), real `TICKET_WRITE` effect routing.
- **Out (documented):** automatic reflect-back resync immediately after a write — the next scheduled/webhook sync reflects the new/updated issue (idempotent via `ExternalRef`). COMMUNICATION/PLAN_CHANGE effects stay simulated.

---

### Task 1: Pure `buildIssueMutation` + SDK `writeIssue`

**Files:**
- Create: `src/integrations/linear/write.ts`
- Test: `tests/linear.write.test.ts`

**Interfaces:**
- Produces:
  - `IssueMutation = { action: "create" | "update"; teamId?: string; id?: string; title?: string; description?: string; stateId?: string }`
  - `buildIssueMutation(payload: unknown): IssueMutation` — validates per the payload contract; throws a clear `Error` on invalid input.
  - `writeIssue(payload: unknown): Promise<{ externalId: string; url?: string }>` — builds the mutation, calls the SDK create/update, returns the resulting issue id + url. (SDK-touching; not unit-tested — typecheck + manual smoke.)

- [ ] **Step 1: Write the failing test (pure builder only)**

```ts
// tests/linear.write.test.ts
import { describe, it, expect } from "vitest";
import { buildIssueMutation } from "@/integrations/linear/write";

describe("buildIssueMutation", () => {
  it("builds a create mutation", () => {
    const m = buildIssueMutation({ action: "create", issue: { teamId: "t1", title: "Bug", description: "d" } });
    expect(m).toEqual({ action: "create", teamId: "t1", id: undefined, title: "Bug", description: "d", stateId: undefined });
  });
  it("builds an update mutation", () => {
    const m = buildIssueMutation({ action: "update", issue: { id: "i1", stateId: "s2" } });
    expect(m.action).toBe("update");
    expect(m.id).toBe("i1");
    expect(m.stateId).toBe("s2");
  });
  it("rejects a bad action", () => {
    expect(() => buildIssueMutation({ action: "delete", issue: {} })).toThrow(/action/);
  });
  it("requires teamId + title on create", () => {
    expect(() => buildIssueMutation({ action: "create", issue: { title: "x" } })).toThrow(/teamId/);
    expect(() => buildIssueMutation({ action: "create", issue: { teamId: "t" } })).toThrow(/title/);
  });
  it("requires id on update", () => {
    expect(() => buildIssueMutation({ action: "update", issue: { title: "x" } })).toThrow(/id/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/linear.write.test.ts`
Expected: FAIL — cannot resolve `@/integrations/linear/write`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/integrations/linear/write.ts
import { linearClient } from "@/integrations/linear/client";

export interface IssueMutation {
  action: "create" | "update";
  teamId?: string; id?: string; title?: string; description?: string; stateId?: string;
}

export function buildIssueMutation(payload: unknown): IssueMutation {
  const p = (payload ?? {}) as { action?: unknown; issue?: unknown };
  const action = p.action;
  if (action !== "create" && action !== "update") {
    throw new Error("TICKET_WRITE: action must be 'create' or 'update'");
  }
  const issue = (p.issue ?? {}) as Record<string, unknown>;
  const str = (k: string): string | undefined => (typeof issue[k] === "string" ? (issue[k] as string) : undefined);
  const mut: IssueMutation = {
    action, teamId: str("teamId"), id: str("id"), title: str("title"), description: str("description"), stateId: str("stateId"),
  };
  if (action === "create" && !mut.teamId) throw new Error("TICKET_WRITE create requires issue.teamId");
  if (action === "create" && !mut.title) throw new Error("TICKET_WRITE create requires issue.title");
  if (action === "update" && !mut.id) throw new Error("TICKET_WRITE update requires issue.id");
  return mut;
}

// Perform the write. SDK-touching; reached only via the HITL gate.
export async function writeIssue(payload: unknown): Promise<{ externalId: string; url?: string }> {
  const mut = buildIssueMutation(payload);
  const client = linearClient();
  if (mut.action === "create") {
    const res = await client.createIssue({ teamId: mut.teamId!, title: mut.title!, description: mut.description, stateId: mut.stateId });
    const issue = res.issue ? await res.issue : undefined;
    return { externalId: issue?.id ?? "", url: issue?.url };
  }
  const res = await client.updateIssue(mut.id!, { title: mut.title, description: mut.description, stateId: mut.stateId });
  const issue = res.issue ? await res.issue : undefined;
  return { externalId: issue?.id ?? "", url: issue?.url };
}
```

- [ ] **Step 4: Run test + typecheck**

Run: `npm test -- tests/linear.write.test.ts && npm run typecheck`
Expected: test PASS (5); typecheck exit 0. If an SDK create/update field name differs for v88, fix the SDK call to the compiler-suggested name — keep `buildIssueMutation` and the return shape unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/integrations/linear/write.ts tests/linear.write.test.ts
git commit -m "feat(linear): buildIssueMutation (pure) + writeIssue via SDK create/update"
```

---

### Task 2: Wire writeTicket + real TICKET_WRITE effect

**Files:**
- Modify: `src/integrations/linear/index.ts` (replace the `writeTicket` stub)
- Modify: `src/hitl/effects.ts` (route TICKET_WRITE to the integration)
- Test: `tests/ticket-write-effect.test.ts`

**Interfaces:**
- Consumes: `writeIssue` (Task 1); `integrationFor` from `@/integrations/registry`.
- Produces: `LinearIntegration.writeTicket(payload)` → `writeIssue(payload)`; `ticketWriteEffect(payload): Promise<{ ref?: string }>` routing to `integrationFor(payload.kind).writeTicket(payload)`; `registerDemoEffects` registers it for `TICKET_WRITE`.

- [ ] **Step 1: Write the failing test (routing, mocked integration)**

```ts
// tests/ticket-write-effect.test.ts
import { describe, it, expect, vi } from "vitest";

const writeTicket = vi.fn(async () => ({ externalId: "LIN-42", url: "https://linear.app/x/LIN-42" }));
vi.mock("@/integrations/registry", () => ({ integrationFor: vi.fn(() => ({ writeTicket })) }));

import { ticketWriteEffect } from "@/hitl/effects";
import { integrationFor } from "@/integrations/registry";

describe("ticketWriteEffect", () => {
  it("routes to the payload's integration and returns its ref", async () => {
    const payload = { kind: "LINEAR", action: "create", issue: { teamId: "t", title: "x" } };
    const res = await ticketWriteEffect(payload);
    expect(integrationFor).toHaveBeenCalledWith("LINEAR");
    expect(writeTicket).toHaveBeenCalledWith(payload);
    expect(res).toEqual({ ref: "LIN-42" });
  });
  it("throws when the payload has no kind", async () => {
    await expect(ticketWriteEffect({ action: "create" })).rejects.toThrow(/kind/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/ticket-write-effect.test.ts`
Expected: FAIL — `ticketWriteEffect` not exported.

- [ ] **Step 3: Implement**

Replace `writeTicket` in `src/integrations/linear/index.ts` (add the import, replace the stub body):

```ts
// import:
import { writeIssue } from "@/integrations/linear/write";
// method:
  async writeTicket(payload: unknown): Promise<{ externalId: string; url?: string }> {
    // Reached ONLY via the HITL gate after human approval.
    return writeIssue(payload);
  }
```

Rewrite `src/hitl/effects.ts`:

```ts
// src/hitl/effects.ts
import type { IntegrationKind } from "@prisma/client";
import { hitl } from "@/hitl/gate";
import { integrationFor } from "@/integrations/registry";

let registered = false;

// The real TICKET_WRITE effect: route to the integration's guarded writeTicket.
export async function ticketWriteEffect(payload: unknown): Promise<{ ref?: string }> {
  const kind = (payload as { kind?: IntegrationKind }).kind;
  if (!kind) throw new Error("TICKET_WRITE payload missing 'kind'");
  const result = await integrationFor(kind).writeTicket(payload);
  return { ref: result.externalId };
}

// COMMUNICATION and PLAN_CHANGE remain simulated (not integration actions).
// TICKET_WRITE is live and writes to the connected tracker via the HITL gate.
export function registerDemoEffects(): void {
  if (registered) return;
  registered = true;
  hitl.register("COMMUNICATION", async () => ({ ref: "sent:simulated" }));
  hitl.register("PLAN_CHANGE", async () => ({ ref: "plan:updated" }));
  hitl.register("TICKET_WRITE", ticketWriteEffect);
}
```

- [ ] **Step 4: Run test + typecheck**

Run: `npm test -- tests/ticket-write-effect.test.ts && npm run typecheck`
Expected: test PASS (2); typecheck exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/integrations/linear/index.ts src/hitl/effects.ts tests/ticket-write-effect.test.ts
git commit -m "feat(linear): live TICKET_WRITE — writeTicket via SDK, gate effect routes to integration"
```

---

### Task 3: Runbook + full verification

**Files:**
- Modify: `docs/linear-sync.md` (append a writes section)

- [ ] **Step 1: Document writes**

Append to `docs/linear-sync.md`:

```markdown
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
```

- [ ] **Step 2: Full verification**

Run: `npm run lint && npm run typecheck && npm test`
Expected: lint 0 errors; typecheck clean; tests pass (L2's 46 + 5 write + 2 effect = 53).

- [ ] **Step 3: Manual smoke (requires a write-scoped key)**

Approve a `TICKET_WRITE` proposal in the dashboard; confirm the issue is created/updated in Linear. If no write-scoped key is available, note as skipped — do NOT fake it.

- [ ] **Step 4: Commit**

```bash
git add docs/linear-sync.md
git commit -m "docs(linear): writes runbook; L3 complete — Linear M1 done"
```

---

## Self-Review notes (author)

- **Spec coverage (L3):** payload contract + validation (T1 `buildIssueMutation`) · SDK create/update (T1 `writeIssue`) · `writeTicket` wired (T2) · gate effect routes to the integration, gate stays the only path (T2) · runbook (T3). Reflect-back resync is a documented non-goal (next sync handles it).
- **Type consistency:** `writeIssue`/`buildIssueMutation` signatures used by `LinearIntegration.writeTicket` (T2); `ticketWriteEffect` return `{ ref }` matches the `Effect` type (`(payload) => Promise<{ ref?: string }>`); `integrationFor(kind).writeTicket(payload)` matches the port.
- **Safety:** no new outward call site — writes flow only through gate `apply` → effect → `writeTicket`; the adversarial non-APPROVED test still guards the gate. SDK write is typecheck-gated + documented manual smoke (unverifiable without a write-scoped key).
