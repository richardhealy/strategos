import { describe, it, expect } from "vitest";
import { scoreScheduleRisk, toSeverity } from "@/agents/risk/scoring";

// Spec definition-of-done #3: a schedule risk flag fires BEFORE a delivery slip.
describe("scoreScheduleRisk", () => {
  it("flags a slip when remaining work exceeds capacity", () => {
    // 60 pts left, 10/sprint, 4 sprints => 40 capacity < 60 => slip.
    const r = scoreScheduleRisk({ remainingPoints: 60, velocityPerSprint: 10, sprintsRemaining: 4 });
    expect(r.willSlip).toBe(true);
    expect(["HIGH", "CRITICAL"]).toContain(r.severity);
  });

  it("does not flag when capacity comfortably covers the work", () => {
    const r = scoreScheduleRisk({ remainingPoints: 20, velocityPerSprint: 10, sprintsRemaining: 4 });
    expect(r.willSlip).toBe(false);
    expect(["LOW", "MEDIUM"]).toContain(r.severity);
  });

  it("treats zero velocity as maximum risk", () => {
    const r = scoreScheduleRisk({ remainingPoints: 5, velocityPerSprint: 0, sprintsRemaining: 3 });
    expect(r.score).toBe(1);
    expect(r.severity).toBe("CRITICAL");
  });

  it("maps scores to severities monotonically", () => {
    expect(toSeverity(0.1)).toBe("LOW");
    expect(toSeverity(0.4)).toBe("MEDIUM");
    expect(toSeverity(0.7)).toBe("HIGH");
    expect(toSeverity(0.9)).toBe("CRITICAL");
  });
});
