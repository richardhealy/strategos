import { describe, it, expect } from "vitest";
import { buildRiskMatrix, worstSeverity, RISK_KINDS } from "@/state/model/matrix";

describe("worstSeverity", () => {
  it("returns LOW for no scores", () => {
    expect(worstSeverity([])).toBe("LOW");
  });
  it("picks the highest severity present", () => {
    expect(worstSeverity(["LOW", "CRITICAL", "MEDIUM"])).toBe("CRITICAL");
  });
});

describe("buildRiskMatrix", () => {
  it("produces one cell per risk kind, in order", () => {
    const rows = buildRiskMatrix([
      { id: "i1", title: "Checkout", riskScores: [{ kind: "SCHEDULE", severity: "HIGH" }] },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.cells.map((c) => c.kind)).toEqual(RISK_KINDS);
    expect(rows[0]!.cells[0]).toEqual({ kind: "SCHEDULE", severity: "HIGH" });
    expect(rows[0]!.cells[1]!.severity).toBeNull(); // DEPENDENCY absent
  });
  it("collapses multiple scores of one kind to the worst", () => {
    const rows = buildRiskMatrix([
      { id: "i1", title: "X", riskScores: [
        { kind: "BLOCKER", severity: "LOW" },
        { kind: "BLOCKER", severity: "HIGH" },
      ] },
    ]);
    const blocker = rows[0]!.cells.find((c) => c.kind === "BLOCKER")!;
    expect(blocker.severity).toBe("HIGH");
  });
});
