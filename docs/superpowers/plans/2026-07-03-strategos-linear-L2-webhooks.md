# Linear Integration — L2 Webhooks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Linear webhooks live — verify the HMAC signature (with replay protection), parse the payload, and let the already-wired on-event routine resync the model within 60s of a change.

**Architecture:** Pure crypto/parse helpers in `webhook.ts` (unit-tested) are wired into `LinearIntegration.verifyWebhook`/`parseWebhook`. The existing route (`app/api/webhooks/[kind]/route.ts`) already verifies then emits `integration/webhook`; the existing `onWebhook` Inngest function already consumes it and runs the idempotent `syncIntegration(kind)`. L2 only unblocks the security gate — no route or Inngest changes needed.

**Tech Stack:** Next.js 15, TypeScript strict, Node `crypto`, Vitest.

## Global Constraints

- TypeScript strict + `noUncheckedIndexedAccess` are ON — guard every index; do not type helper accumulators as `Record<string, number>` (use concrete-keyed literals in tests).
- Internal imports as `@/…`.
- Vitest tests must not require a database or network.
- Webhook secret is read from `process.env.LINEAR_WEBHOOK_SECRET` directly (NOT via `linearConfig()`, which requires the API key — webhook verification must not depend on the API key).
- Signature scheme (from Linear docs): `linear-signature` header is the hex HMAC-SHA256 of the raw request body keyed by the webhook secret; compare timing-safe. Reject if `webhookTimestamp` in the body is more than 60s from now (replay protection).
- Paths relative to `/Users/richardfernandez/Code/blueprint-projects/strategos`. Commit author is configured; do NOT `git add -A`.

## Scope / non-goals

- **In:** `verifyWebhook` (HMAC + replay), `parseWebhook`, wiring into `LinearIntegration`, runbook for registering the webhook.
- **Out (documented deferral):** true per-resource "targeted" resync. The on-event path runs the full *idempotent* `syncIntegration(kind)` (already wired), which meets the 60s DoD for a normal workspace. Per-resource pull-by-id is a later optimization.

---

### Task 1: Webhook crypto + parse helpers (pure)

**Files:**
- Create: `src/integrations/linear/webhook.ts`
- Test: `tests/linear.webhook.test.ts`

**Interfaces:**
- Produces:
  - `verifyLinearSignature(rawBody: string, signatureHeader: string | undefined, secret: string): boolean` — hex-decode the header, HMAC-SHA256 the body with the secret, timing-safe compare; false on missing header, bad hex, or length mismatch.
  - `withinReplayWindow(webhookTimestamp: number | undefined, now: number, windowMs?: number): boolean` — false unless `|now - ts| <= windowMs` (default 60000).
  - `parseLinearWebhook(body: string): { resource: string; externalId: string }` — from Linear's `{ type, data: { id } }`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/linear.webhook.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/linear.webhook.test.ts`
Expected: FAIL — cannot resolve `@/integrations/linear/webhook`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/integrations/linear/webhook.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/linear.webhook.test.ts`
Expected: PASS (7 tests).

Note: `Buffer.from(hex, "hex")` does not throw on odd/invalid hex (it truncates), so the `"zzzz"` case is caught by the length-mismatch guard, not the try/catch — both paths return false, which the test asserts.

- [ ] **Step 5: Commit**

```bash
git add src/integrations/linear/webhook.ts tests/linear.webhook.test.ts
git commit -m "feat(linear): webhook HMAC verify + replay window + payload parse (pure)"
```

---

### Task 2: Wire verify/parse into LinearIntegration

**Files:**
- Modify: `src/integrations/linear/index.ts` (replace the `verifyWebhook`/`parseWebhook` stubs)

**Interfaces:**
- Consumes: the Task 1 helpers; `process.env.LINEAR_WEBHOOK_SECRET`.
- Produces: `verifyWebhook(headers, body)` returns true only for a valid signature AND a fresh timestamp; `parseWebhook(body)` returns `{ resource, externalId }`.

- [ ] **Step 1: Replace the two stubs**

In `src/integrations/linear/index.ts`, add the import and replace the `verifyWebhook` and `parseWebhook` method bodies (leave `writeTicket` as the L3 stub):

```ts
// add to imports:
import { verifyLinearSignature, withinReplayWindow, parseLinearWebhook } from "@/integrations/linear/webhook";
```

```ts
// replace verifyWebhook + parseWebhook:
  verifyWebhook(headers: Record<string, string>, body: string): boolean {
    const secret = process.env.LINEAR_WEBHOOK_SECRET;
    if (!secret) return false;
    if (!verifyLinearSignature(body, headers["linear-signature"], secret)) return false;
    let ts: number | undefined;
    try {
      ts = (JSON.parse(body) as { webhookTimestamp?: number }).webhookTimestamp;
    } catch {
      return false;
    }
    return withinReplayWindow(ts, Date.now());
  }

  parseWebhook(body: string): { resource: string; externalId: string } {
    return parseLinearWebhook(body);
  }
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS (exit 0).

- [ ] **Step 3: Commit**

```bash
git add src/integrations/linear/index.ts
git commit -m "feat(linear): live webhook verify (HMAC+replay) + parse; on-event resync now unblocked"
```

---

### Task 3: Runbook + full verification

**Files:**
- Modify: `docs/linear-sync.md` (append a webhook section)

- [ ] **Step 1: Document webhook setup**

Append to `docs/linear-sync.md`:

```markdown
## Webhooks (L2)

1. Set `LINEAR_WEBHOOK_SECRET` in `.env` (any strong random string you also give Linear).
2. In Linear → Settings → API → Webhooks, create a webhook:
   - URL: `<your deploy>/api/webhooks/linear`
   - Secret: the same `LINEAR_WEBHOOK_SECRET`
   - Subscribe to Issues / Projects / Cycles.
3. On a change in Linear, the route verifies the `linear-signature` HMAC + a 60s
   replay window, then emits `integration/webhook`; the `onWebhook` Inngest
   function runs an idempotent `syncIntegration('LINEAR')`, updating the model
   within ~60s. (True per-resource targeting is a later optimization; the full
   resync is idempotent via `ExternalRef`.)
4. Locally, run the Inngest dev server alongside the app to process events:
   `npm run inngest:dev`.
```

- [ ] **Step 2: Full verification**

Run: `npm run lint && npm run typecheck && npm test`
Expected: lint 0 errors; typecheck clean; tests pass (L1's 38 + 7 webhook = 45).

- [ ] **Step 3: Manual smoke (requires deploy + a registered webhook)**

Register the webhook per the runbook, make a change in Linear, and confirm the model updates (a new `StateChange`/updated row appears) within a minute. Requires a public URL + Inngest running. If not available, note as skipped — do NOT fake it.

- [ ] **Step 4: Commit**

```bash
git add docs/linear-sync.md
git commit -m "docs(linear): webhook setup runbook; L2 webhooks complete"
```

---

## Self-Review notes (author)

- **Spec coverage (L2):** `verifyWebhook` HMAC + replay (T1/T2) · `parseWebhook` (T1/T2) · on-event resync within 60s — already wired via `onWebhook` → `syncIntegration`, unblocked by T2 · runbook (T3). The design's "targeted" resync is intentionally realized as a full idempotent resync (documented non-goal).
- **Type consistency:** the three helpers' signatures are used verbatim by `LinearIntegration` in T2; the webhook route already calls `verifyWebhook(headers, body)` with lowercased header keys (`linear-signature`) and the raw `await req.text()` body — matching T2's expectations.
- **Security:** secret read from `process.env` (not `linearConfig`), so verification never requires the API key; timing-safe compare; length guard before `timingSafeEqual` (which throws on unequal lengths); replay window closes the resend hole.
