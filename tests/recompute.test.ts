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
