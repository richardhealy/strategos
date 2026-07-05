import { describe, it, expect, vi } from "vitest";

// readiness.ts imports @/llm/client (which loads @/config); mock it so the pure
// parseReadiness tests don't require a live environment.
vi.mock("@/llm/client", () => ({ complete: vi.fn() }));

import { parseReadiness, type ReadyTask } from "@/agents/agentplan/readiness";

const batch: ReadyTask[] = [
  { externalId: "a", title: "A", description: "clear" },
  { externalId: "b", title: "B", description: null },
];

describe("parseReadiness", () => {
  it("maps a well-formed JSON array to verdicts", () => {
    const raw = '[{"externalId":"a","status":"READY","reason":"clear"},{"externalId":"b","status":"NEEDS_SPEC","reason":"no body"}]';
    expect(parseReadiness(raw, batch)).toEqual([
      { externalId: "a", status: "READY", reason: "clear" },
      { externalId: "b", status: "NEEDS_SPEC", reason: "no body" },
    ]);
  });
  it("tolerates code fences and unknown status -> NEEDS_SPEC", () => {
    const raw = '```json\n[{"externalId":"a","status":"weird","reason":"x"}]\n```';
    expect(parseReadiness(raw, batch)[0]).toEqual({ externalId: "a", status: "NEEDS_SPEC", reason: "x" });
  });
  it("on unparseable output, defaults every batch task to NEEDS_SPEC", () => {
    const out = parseReadiness("not json", batch);
    expect(out.map((v) => v.status)).toEqual(["NEEDS_SPEC", "NEEDS_SPEC"]);
  });
});
