import { describe, it, expect, vi, beforeEach } from "vitest";

// Fixture: programs keyed by id, each with an initiative count. The mocked db
// answers findUnique/findFirst from here so we can assert which program the
// dashboard resolves to.
type Prog = { id: string; initiatives: number; createdAt: number };
let programs: Prog[] = [];
// __program__ cursors in the order db.syncCursor.findMany would return them
// (updatedAt desc — newest sync first).
let cursors: { cursor: string | null }[] = [];

vi.mock("@/db", () => ({
  db: {
    syncCursor: {
      findMany: vi.fn(async () => cursors),
    },
    program: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const p = programs.find((x) => x.id === where.id);
        return p ? { id: p.id, _count: { initiatives: p.initiatives } } : null;
      }),
      findFirst: vi.fn(async () => {
        const oldest = [...programs].sort((a, b) => a.createdAt - b.createdAt)[0];
        return oldest ? { id: oldest.id } : null;
      }),
    },
  },
}));

import { programModel } from "@/state/model/repository";

beforeEach(() => {
  programs = [];
  cursors = [];
});

describe("primaryProgramId — dashboard program selection", () => {
  it("prefers the newest synced program that has data over more-recently-synced empty ones", async () => {
    // Reproduces the reported bug: Linear synced first (has data), the stub
    // integrations synced later create empty programs whose cursors are newer.
    programs = [
      { id: "linear", initiatives: 14, createdAt: 1 },
      { id: "github", initiatives: 0, createdAt: 2 },
      { id: "azure", initiatives: 0, createdAt: 3 },
    ];
    cursors = [{ cursor: "azure" }, { cursor: "github" }, { cursor: "linear" }];

    expect(await programModel.primaryProgramId()).toBe("linear");
  });

  it("falls back to the oldest program (demo seed) when no synced program has data", async () => {
    programs = [
      { id: "seed", initiatives: 6, createdAt: 1 },
      { id: "azure", initiatives: 0, createdAt: 2 },
    ];
    cursors = [{ cursor: "azure" }]; // only empty stub synced

    expect(await programModel.primaryProgramId()).toBe("seed");
  });

  it("ignores cursors pointing at deleted programs", async () => {
    programs = [{ id: "linear", initiatives: 3, createdAt: 1 }];
    cursors = [{ cursor: "ghost" }, { cursor: "linear" }]; // ghost no longer exists

    expect(await programModel.primaryProgramId()).toBe("linear");
  });

  it("returns null when there are no programs at all", async () => {
    expect(await programModel.primaryProgramId()).toBeNull();
  });
});
