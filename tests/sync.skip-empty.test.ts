import { describe, it, expect, vi, beforeEach } from "vitest";

// Assert the sync no longer manufactures an empty program for an integration
// that pulls nothing and has no program yet (the unimplemented stub trackers).
const dbCalls = { programCreate: 0, cursorUpsert: 0 };

vi.mock("@/db", () => ({
  db: {
    syncCursor: {
      findUnique: vi.fn(async () => null), // no existing __program__ cursor for this kind
      upsert: vi.fn(async () => { dbCalls.cursorUpsert++; return {}; }),
    },
    program: {
      create: vi.fn(async () => { dbCalls.programCreate++; return { id: "should-not-happen" }; }),
    },
  },
}));

const emptyPull = async () => ({ items: [] });
vi.mock("@/integrations/registry", () => ({
  integrationFor: () => ({
    pullInitiatives: emptyPull,
    pullEpics: emptyPull,
    pullTasks: emptyPull,
    pullDeliveryHistory: emptyPull,
  }),
}));

import { syncIntegration } from "@/state/sync/syncEngine";

beforeEach(() => { dbCalls.programCreate = 0; dbCalls.cursorUpsert = 0; });

describe("syncIntegration — empty stub integrations", () => {
  it("does not create a program or cursor when nothing is pulled and none exists", async () => {
    const out = await syncIntegration("AZURE_DEVOPS");

    expect(dbCalls.programCreate).toBe(0);
    expect(dbCalls.cursorUpsert).toBe(0);
    expect(out).toMatchObject({ initiatives: 0, epics: 0, tasks: 0 });
  });
});
