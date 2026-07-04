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
