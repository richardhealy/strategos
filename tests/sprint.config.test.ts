import { describe, it, expect } from "vitest";
import { parseSprintConfig } from "@/config/sprint";

describe("parseSprintConfig", () => {
  it("applies defaults when env is empty", () => {
    const c = parseSprintConfig({});
    expect(c).toEqual({ label: "strategos", lengthDays: 14, seedCapacity: 8, team: null });
  });
  it("reads overrides", () => {
    const c = parseSprintConfig({
      STRATEGOS_SPRINT_LABEL: "sprintable",
      STRATEGOS_SPRINT_LENGTH_DAYS: "7",
      STRATEGOS_SPRINT_SEED_CAPACITY: "5",
      STRATEGOS_SPRINT_TEAM: "ENG",
    });
    expect(c).toEqual({ label: "sprintable", lengthDays: 7, seedCapacity: 5, team: "ENG" });
  });
  it("ignores non-numeric length/capacity and uses defaults", () => {
    const c = parseSprintConfig({ STRATEGOS_SPRINT_LENGTH_DAYS: "abc" });
    expect(c.lengthDays).toBe(14);
  });
});
