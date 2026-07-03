import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { verifyLinearSignature, withinReplayWindow, parseLinearWebhook } from "@/integrations/linear/webhook";

const SECRET = "shhh";
const BODY = JSON.stringify({ type: "Issue", data: { id: "iss_123" }, webhookTimestamp: 1_000_000 });
const goodSig = createHmac("sha256", SECRET).update(BODY).digest("hex");

describe("verifyLinearSignature", () => {
  it("accepts a correctly signed body", () => {
    expect(verifyLinearSignature(BODY, goodSig, SECRET)).toBe(true);
  });
  it("rejects a tampered body", () => {
    expect(verifyLinearSignature(BODY + " ", goodSig, SECRET)).toBe(false);
  });
  it("rejects a missing or malformed signature", () => {
    expect(verifyLinearSignature(BODY, undefined, SECRET)).toBe(false);
    expect(verifyLinearSignature(BODY, "zzzz", SECRET)).toBe(false);
  });
});

describe("withinReplayWindow", () => {
  it("accepts a fresh timestamp", () => {
    expect(withinReplayWindow(1_000_000, 1_030_000)).toBe(true); // 30s
  });
  it("rejects a stale timestamp", () => {
    expect(withinReplayWindow(1_000_000, 1_090_000)).toBe(false); // 90s
  });
  it("rejects a missing timestamp", () => {
    expect(withinReplayWindow(undefined, 1_000_000)).toBe(false);
  });
});

describe("parseLinearWebhook", () => {
  it("extracts resource type and external id", () => {
    expect(parseLinearWebhook(BODY)).toEqual({ resource: "Issue", externalId: "iss_123" });
  });
  it("tolerates a missing data id", () => {
    expect(parseLinearWebhook(JSON.stringify({ type: "Project" }))).toEqual({ resource: "Project", externalId: "" });
  });
});
