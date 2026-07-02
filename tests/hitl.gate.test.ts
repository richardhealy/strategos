import { describe, it, expect, vi, beforeEach } from "vitest";

// Spec definition-of-done #5: the HITL gate cannot be bypassed. An adversarial
// input that tries to skip approval must be blocked. We stub the DB so the test
// runs without Postgres and asserts the gate's refusal logic directly.

const state: { proposal: { id: string; kind: string; state: string; payload: unknown } } = {
  proposal: { id: "p1", kind: "TICKET_WRITE", state: "PENDING", payload: { foo: 1 } },
};

vi.mock("@/db", () => ({
  db: {
    hitlProposal: {
      findUniqueOrThrow: vi.fn(async () => state.proposal),
      update: vi.fn(async ({ data }: { data: { state?: string } }) => {
        if (data.state) state.proposal.state = data.state;
        return state.proposal;
      }),
      create: vi.fn(async () => state.proposal),
    },
    actionLog: { create: vi.fn(async () => ({})) },
    stateChange: { create: vi.fn(async () => ({})) },
  },
}));

import { HitlGate } from "@/hitl/gate";

describe("HitlGate", () => {
  beforeEach(() => {
    state.proposal.state = "PENDING";
  });

  it("refuses to apply a proposal that was never approved", async () => {
    const gate = new HitlGate();
    const effect = vi.fn(async () => ({ ref: "x" }));
    gate.register("TICKET_WRITE", effect);

    await expect(gate.apply("p1")).rejects.toThrow(/cannot apply proposal in state PENDING/);
    expect(effect).not.toHaveBeenCalled(); // the outside world was never touched
  });

  it("refuses to apply a rejected proposal", async () => {
    const gate = new HitlGate();
    const effect = vi.fn(async () => ({ ref: "x" }));
    gate.register("TICKET_WRITE", effect);
    state.proposal.state = "REJECTED";

    await expect(gate.apply("p1")).rejects.toThrow();
    expect(effect).not.toHaveBeenCalled();
  });

  it("performs the effect exactly once after approval", async () => {
    const gate = new HitlGate();
    const effect = vi.fn(async () => ({ ref: "ISSUE-1" }));
    gate.register("TICKET_WRITE", effect);
    state.proposal.state = "APPROVED";

    const res = await gate.apply("p1");
    expect(effect).toHaveBeenCalledTimes(1);
    expect(res.ref).toBe("ISSUE-1");
  });
});
