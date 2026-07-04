import { describe, it, expect } from "vitest";
import { isSprintOpen } from "@/state/model/repository";

describe("isSprintOpen", () => {
  it("open when endsAt is in the future", () => {
    expect(isSprintOpen("2026-07-20T00:00:00.000Z", new Date("2026-07-10"))).toBe(true);
  });
  it("closed when endsAt has passed", () => {
    expect(isSprintOpen("2026-07-01T00:00:00.000Z", new Date("2026-07-10"))).toBe(false);
  });
  it("closed when endsAt missing", () => {
    expect(isSprintOpen(undefined, new Date("2026-07-10"))).toBe(false);
  });
});
