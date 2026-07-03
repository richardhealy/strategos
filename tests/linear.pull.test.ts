import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Linear client so pull.ts talks to our fake GraphQL transport instead
// of the network. rawRequest is hoisted so the vi.mock factory can close over it.
const { rawRequest } = vi.hoisted(() => ({ rawRequest: vi.fn() }));
vi.mock("@/integrations/linear/client", () => ({
  linearClient: () => ({ client: { rawRequest } }),
}));

import { pullIssues } from "@/integrations/linear/pull";

function onePage(field: string, nodes: unknown[]) {
  return { data: { [field]: { nodes, pageInfo: { hasNextPage: false, endCursor: null } } } };
}

describe("pullIssues", () => {
  beforeEach(() => rawRequest.mockReset());

  it("fetches every issue's nested fields in ONE request and maps them", async () => {
    rawRequest.mockResolvedValueOnce(
      onePage("issues", [
        {
          id: "i1", title: "Fix login", estimate: 3, updatedAt: "2026-01-01T00:00:00.000Z", priority: 2,
          team: { key: "ENG" }, project: { id: "p1" }, projectMilestone: { id: "m1" },
          assignee: { name: "Ada" }, state: { type: "started", name: "In Progress" },
        },
      ]),
    );

    const tasks = await pullIssues([]);

    // The whole point of the fix: no per-issue fetches — a single paged query.
    expect(rawRequest).toHaveBeenCalledTimes(1);
    expect(tasks).toEqual([
      {
        externalId: "i1",
        epicExternalId: "m1",
        title: "Fix login",
        status: "started",
        estimatePoints: 3,
        assignee: "Ada",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
  });

  it("drops issues with no project (inbox/triage noise)", async () => {
    rawRequest.mockResolvedValueOnce(
      onePage("issues", [
        { id: "i2", title: "Triage", team: { key: "ENG" }, project: null, projectMilestone: null, assignee: null, state: { type: "backlog", name: "Backlog" } },
      ]),
    );
    expect(await pullIssues([])).toEqual([]);
  });

  it("keeps only issues on the configured teams when scoped", async () => {
    rawRequest.mockResolvedValueOnce(
      onePage("issues", [
        { id: "a", title: "in", team: { key: "ENG" }, project: { id: "p1" }, projectMilestone: null, assignee: null, state: { type: "started", name: "s" } },
        { id: "b", title: "out", team: { key: "OPS" }, project: { id: "p2" }, projectMilestone: null, assignee: null, state: { type: "started", name: "s" } },
      ]),
    );
    const tasks = await pullIssues(["ENG"]);
    expect(tasks.map((t) => t.externalId)).toEqual(["a"]);
  });

  it("throws on GraphQL errors so syncAll can record the failure instead of crashing", async () => {
    rawRequest.mockResolvedValueOnce({ errors: [{ message: "Rate limit exceeded" }] });
    await expect(pullIssues([])).rejects.toThrow(/Rate limit/);
  });
});
