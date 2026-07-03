import { createHmac, timingSafeEqual } from "node:crypto";

// Verify Linear's `linear-signature` header: hex HMAC-SHA256 of the RAW body.
export function verifyLinearSignature(rawBody: string, signatureHeader: string | undefined, secret: string): boolean {
  if (!signatureHeader) return false;
  let headerBuf: Buffer;
  try {
    headerBuf = Buffer.from(signatureHeader, "hex");
  } catch {
    return false;
  }
  if (headerBuf.length === 0) return false;
  const computed = createHmac("sha256", secret).update(rawBody).digest();
  if (headerBuf.length !== computed.length) return false;
  return timingSafeEqual(computed, headerBuf);
}

// Reject webhooks whose timestamp is outside the replay window (default 60s).
export function withinReplayWindow(webhookTimestamp: number | undefined, now: number, windowMs = 60_000): boolean {
  if (typeof webhookTimestamp !== "number") return false;
  return Math.abs(now - webhookTimestamp) <= windowMs;
}

export function parseLinearWebhook(body: string): { resource: string; externalId: string } {
  const payload = JSON.parse(body) as { type?: string; data?: { id?: string } };
  return { resource: payload.type ?? "unknown", externalId: payload.data?.id ?? "" };
}
