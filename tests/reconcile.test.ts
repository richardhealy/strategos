import { describe, it, expect, vi, beforeEach } from "vitest";

const calls = { create: 0, update: 0, recordChange: 0, refCreate: 0 };
const refs = new Map<string, string>(); // `${kind}:${externalId}` -> rowId

vi.mock("@/db", () => ({
  db: {
    externalRef: {
      findUnique: vi.fn(async ({ where }: { where: { kind_externalId: { kind: string; externalId: string } } }) => {
        const k = `${where.kind_externalId.kind}:${where.kind_externalId.externalId}`;
        return refs.has(k) ? { id: "ref", initiativeId: refs.get(k) } : null;
      }),
      create: vi.fn(async ({ data }: { data: { kind: string; externalId: string; initiativeId?: string } }) => {
        calls.refCreate++; refs.set(`${data.kind}:${data.externalId}`, data.initiativeId ?? "row-new"); return { id: "ref" };
      }),
    },
  },
}));
vi.mock("@/state/versioned/provenance", () => ({ recordChange: vi.fn(async () => { calls.recordChange++; }) }));

import { upsertByRef } from "@/state/sync/reconcile";

beforeEach(() => { calls.create = calls.update = calls.recordChange = calls.refCreate = 0; refs.clear(); });

describe("upsertByRef", () => {
  it("creates the row and an ExternalRef when none exists", async () => {
    const res = await upsertByRef({
      kind: "LINEAR", externalId: "p1", entityType: "Initiative", source: "sync:linear",
      load: async () => null,
      create: async () => { calls.create++; return { id: "row-new" }; },
      update: async (r) => { calls.update++; return r; },
      changed: () => false,
    });
    expect(calls.create).toBe(1);
    expect(calls.refCreate).toBe(1);
    expect(res.row.id).toBe("row-new");
  });

  it("updates + records a change when the ref exists and the row changed", async () => {
    refs.set("LINEAR:p1", "row-1");
    await upsertByRef({
      kind: "LINEAR", externalId: "p1", entityType: "Initiative", source: "sync:linear",
      load: async () => ({ id: "row-1" }),
      create: async () => { calls.create++; return { id: "x" }; },
      update: async (r) => { calls.update++; return r; },
      changed: () => true,
    });
    expect(calls.create).toBe(0);
    expect(calls.update).toBe(1);
    expect(calls.recordChange).toBe(1);
  });

  it("does nothing extra when the row is unchanged", async () => {
    refs.set("LINEAR:p1", "row-1");
    await upsertByRef({
      kind: "LINEAR", externalId: "p1", entityType: "Initiative", source: "sync:linear",
      load: async () => ({ id: "row-1" }),
      create: async () => ({ id: "x" }),
      update: async (r) => { calls.update++; return r; },
      changed: () => false,
    });
    expect(calls.update).toBe(0);
    expect(calls.recordChange).toBe(0);
  });
});
