import { describe, it, expect } from "vitest";
import { parseAgentModeConfig } from "@/config/agentmode";

describe("parseAgentModeConfig", () => {
  it("defaults", () => {
    expect(parseAgentModeConfig({})).toEqual({ label: "agent", readinessBatch: 20 });
  });
  it("overrides", () => {
    expect(parseAgentModeConfig({ STRATEGOS_AGENT_LABEL: "ai", STRATEGOS_READINESS_BATCH: "5" }))
      .toEqual({ label: "ai", readinessBatch: 5 });
  });
  it("ignores non-numeric batch", () => {
    expect(parseAgentModeConfig({ STRATEGOS_READINESS_BATCH: "x" }).readinessBatch).toBe(20);
  });
});
