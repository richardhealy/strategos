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
