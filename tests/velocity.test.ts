import { describe, it, expect } from "vitest";
import { velocityPerSprint, velocityTrend } from "@/agents/risk/velocity";

describe("velocityPerSprint", () => {
  it("returns 0 for an empty series", () => {
    expect(velocityPerSprint([])).toBe(0);
  });
  it("averages the last three periods", () => {
    expect(velocityPerSprint([10, 20, 30, 40, 50])).toBe(40); // (30+40+50)/3
  });
});

describe("velocityTrend", () => {
  it("is STABLE with fewer than two points", () => {
    expect(velocityTrend([12])).toBe("STABLE");
  });
  it("detects a rising trend", () => {
    expect(velocityTrend([10, 12, 15, 18])).toBe("RISING");
  });
  it("detects a dropping trend", () => {
    expect(velocityTrend([30, 24, 18, 12])).toBe("DROPPING");
  });
  it("is STABLE within a 10% band", () => {
    expect(velocityTrend([20, 21, 20, 21])).toBe("STABLE");
  });
});
