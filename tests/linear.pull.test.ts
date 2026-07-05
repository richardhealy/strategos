import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Linear client so pull.ts talks to our fake GraphQL transport instead
// of the network. rawRequest is hoisted so the vi.mock factory can close over it.
const { rawRequest } = vi.hoisted(() => ({ rawRequest: vi.fn() }));
vi.mock("@/integrations/linear/client", () => ({
  linearClient: () => ({ client: { rawRequest } }),
}));

import { pullIssues, pullProjects } from "@/integrations/linear/pull";

function onePage(field: string, nodes: unknown[]) {
  return { data: { [field]: { nodes, pageInfo: { hasNextPage: false, endCursor: null } } } };
}

describe("pullProjects managed flag", () => {
  beforeEach(() => rawRequest.mockReset());
  it("marks a project managed only if it carries the configured label", async () => {
    rawRequest.mockResolvedValueOnce(
      onePage("projects", [
        { id: "p1", name: "Real", targetDate: null, state: "started", lead: null,
          teams: { nodes: [{ key: "ENG" }] }, projectMilestones: { nodes: [] },
          labels: { nodes: [{ name: "strategos" }] } },
        { id: "p2", name: "Junk", targetDate: null, state: null, lead: null,
          teams: { nodes: [{ key: "ENG" }] }, projectMilestones: { nodes: [] },
          labels: { nodes: [{ name: "misc" }] } },
      ]),
    );
    const inits = await pullProjects([]);
    expect(inits.find((i) => i.externalId === "p1")?.managed).toBe(true);
    expect(inits.find((i) => i.externalId === "p2")?.managed).toBe(false);
  });
});

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
        priority: 2,
        blockerExternalIds: [],
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

describe("pullProjects mode from agent label", () => {
  beforeEach(() => rawRequest.mockReset());
  it("sets AI when the agent label is present, else HUMAN", async () => {
    rawRequest.mockResolvedValueOnce(
      onePage("projects", [
        { id: "p1", name: "Bot", targetDate: null, state: null, lead: null,
          teams: { nodes: [{ key: "ENG" }] }, projectMilestones: { nodes: [] },
          labels: { nodes: [{ name: "strategos" }, { name: "agent" }] } },
        { id: "p2", name: "Human", targetDate: null, state: null, lead: null,
          teams: { nodes: [{ key: "ENG" }] }, projectMilestones: { nodes: [] },
          labels: { nodes: [{ name: "strategos" }] } },
      ]),
    );
    const inits = await pullProjects([]);
    expect(inits.find((i) => i.externalId === "p1")?.mode).toBe("AI");
    expect(inits.find((i) => i.externalId === "p2")?.mode).toBe("HUMAN");
  });
});

describe("pullIssues description + blockers", () => {
  beforeEach(() => rawRequest.mockReset());
  it("carries description and blocked-by issue ids", async () => {
    rawRequest.mockResolvedValueOnce(
      onePage("issues", [
        { id: "i1", title: "A", estimate: null, updatedAt: "2026-01-01T00:00:00.000Z", priority: 0,
          team: { key: "ENG" }, project: { id: "p1" }, projectMilestone: null,
          assignee: null, state: { type: "started", name: "s" },
          description: "do the thing",
          inverseRelations: { nodes: [
            { type: "blocks", issue: { id: "blocker1" } },
            { type: "related", issue: { id: "noise" } },
          ] } },
      ]),
    );
    const tasks = await pullIssues([]);
    expect(tasks[0]?.description).toBe("do the thing");
    expect(tasks[0]?.blockerExternalIds).toEqual(["blocker1"]);
  });
});
