import { describe, it, expect, vi, beforeEach } from "vitest";

const { propose, candidateTasksForSprint, activeSprintTaskIds, completedSprintCounts, sprintCount } = vi.hoisted(() => ({
  propose: vi.fn(async (_input: unknown) => "prop-1"),
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
vi.mock("@/state/versioned/provenance", () => ({ recordAction: vi.fn(async () => undefined) }));

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
    const arg = propose.mock.calls[0]?.[0] as {
      kind: string; createdBy: string; payload: { taskExternalIds: string[]; rationale: string };
    };
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
