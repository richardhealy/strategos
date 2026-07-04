import { describe, it, expect } from "vitest";
import { mapProject, mapMilestone, generalEpicFor, mapIssue, mapCycle, epicExternalIdForIssue } from "@/integrations/linear/map";

describe("mapProject", () => {
  it("maps a project to a RawInitiative", () => {
    const r = mapProject({ id: "p1", name: "Checkout", leadName: "A. Kir", targetDate: "2026-09-30", state: "started", managed: true });
    expect(r).toEqual({ externalId: "p1", title: "Checkout", owner: "A. Kir", status: "started", targetDate: "2026-09-30", managed: true });
  });
});

describe("mapMilestone / generalEpicFor", () => {
  it("maps a milestone to a RawEpic under its project", () => {
    const r = mapMilestone({ id: "m1", name: "Beta", projectId: "p1", targetDate: "2026-08-01" });
    expect(r.externalId).toBe("m1");
    expect(r.initiativeExternalId).toBe("p1");
    expect(r.title).toBe("Beta");
    expect(r.targetDate).toBe("2026-08-01");
  });
  it("builds a stable General epic per project", () => {
    const r = generalEpicFor("p1");
    expect(r.externalId).toBe("p1::general");
    expect(r.initiativeExternalId).toBe("p1");
    expect(r.title).toBe("General");
  });
});

describe("epicExternalIdForIssue", () => {
  it("uses the milestone when present", () => {
    expect(epicExternalIdForIssue({ id: "i", title: "t", projectId: "p1", milestoneId: "m1" })).toBe("m1");
  });
  it("falls back to the project General epic", () => {
    expect(epicExternalIdForIssue({ id: "i", title: "t", projectId: "p1" })).toBe("p1::general");
  });
});

describe("mapIssue", () => {
  it("maps estimate/assignee/state and epic linkage", () => {
    const r = mapIssue({ id: "i1", title: "Fix", projectId: "p1", milestoneId: "m1", teamKey: "ENG", estimate: 5, assigneeName: "R. Cho", stateType: "started", stateName: "In Progress", updatedAt: "2026-06-01", blockedByIssueIds: ["i9"] });
    expect(r.externalId).toBe("i1");
    expect(r.epicExternalId).toBe("m1");
    expect(r.estimatePoints).toBe(5);
    expect(r.assignee).toBe("R. Cho");
    expect(r.status).toBe("started");
  });
  it("carries Linear priority onto the task", () => {
    const r = mapIssue({ id: "i1", title: "x", projectId: "p1", stateType: "started", priority: 2 });
    expect(r.priority).toBe(2);
  });
});

describe("mapCycle", () => {
  it("maps a cycle delivery to a DeliveryEvent", () => {
    const r = mapCycle({ teamKey: "ENG", completedPoints: 22, committedPoints: 26, startsAt: "2026-06-01", endsAt: "2026-06-15" });
    expect(r).toEqual({ teamKey: "ENG", points: 22, completedAt: "2026-06-15" });
  });
});
