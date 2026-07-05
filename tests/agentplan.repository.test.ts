import { describe, it, expect } from "vitest";
import { readinessKey } from "@/state/model/repository";

describe("readinessKey", () => {
  it("maps enum values to breakdown keys, null -> needs_spec", () => {
    expect(readinessKey("READY")).toBe("ready");
    expect(readinessKey("NEEDS_SPEC")).toBe("needs_spec");
    expect(readinessKey("BLOCKED")).toBe("blocked");
    expect(readinessKey(null)).toBe("needs_spec");
  });
});
