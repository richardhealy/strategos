import { describe, it, expect } from "vitest";
import { planWaves } from "@/agents/agentplan/waves";

describe("planWaves", () => {
  it("no edges -> one flat wave", () => {
    expect(planWaves(["a", "b", "c"], [])).toEqual({ waves: [["a", "b", "c"]], cyclic: [] });
  });
  it("layers blockers before blocked", () => {
    const r = planWaves(["a", "b", "c"], [{ blocked: "b", blocker: "a" }, { blocked: "c", blocker: "b" }]);
    expect(r.waves).toEqual([["a"], ["b"], ["c"]]);
    expect(r.cyclic).toEqual([]);
  });
  it("orders within a wave by leverage (fan-out) desc", () => {
    const r = planWaves(["a", "b", "c", "d"], [{ blocked: "b", blocker: "a" }, { blocked: "c", blocker: "a" }]);
    expect(r.waves[0]).toEqual(["a", "d"]);
  });
  it("drops edges whose blocker is not ready", () => {
    const r = planWaves(["b"], [{ blocked: "b", blocker: "a" }]);
    expect(r.waves).toEqual([["b"]]);
  });
  it("breaks a cycle deterministically and reports it", () => {
    const r = planWaves(["a", "b"], [{ blocked: "a", blocker: "b" }, { blocked: "b", blocker: "a" }]);
    expect(r.cyclic.sort()).toEqual(["a", "b"]);
  });
});
