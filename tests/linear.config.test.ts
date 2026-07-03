import { describe, it, expect } from "vitest";
import { parseLinearConfig } from "@/config/linear";

describe("parseLinearConfig", () => {
  it("throws when the API key is missing", () => {
    expect(() => parseLinearConfig({})).toThrow(/LINEAR_API_KEY/);
  });
  it("parses key, secret, and team keys", () => {
    const c = parseLinearConfig({ LINEAR_API_KEY: "k", LINEAR_WEBHOOK_SECRET: "s", LINEAR_TEAM_KEYS: "ENG, OPS ,, PLA" });
    expect(c.apiKey).toBe("k");
    expect(c.webhookSecret).toBe("s");
    expect(c.teamKeys).toEqual(["ENG", "OPS", "PLA"]);
  });
  it("defaults secret to null and teamKeys to empty", () => {
    const c = parseLinearConfig({ LINEAR_API_KEY: "k" });
    expect(c.webhookSecret).toBeNull();
    expect(c.teamKeys).toEqual([]);
  });
});
