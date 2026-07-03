import { describe, it, expect } from "vitest";
import { buildIssueMutation } from "@/integrations/linear/write";

describe("buildIssueMutation", () => {
  it("builds a create mutation", () => {
    const m = buildIssueMutation({ action: "create", issue: { teamId: "t1", title: "Bug", description: "d" } });
    expect(m).toEqual({ action: "create", teamId: "t1", id: undefined, title: "Bug", description: "d", stateId: undefined });
  });
  it("builds an update mutation", () => {
    const m = buildIssueMutation({ action: "update", issue: { id: "i1", stateId: "s2" } });
    expect(m.action).toBe("update");
    expect(m.id).toBe("i1");
    expect(m.stateId).toBe("s2");
  });
  it("rejects a bad action", () => {
    expect(() => buildIssueMutation({ action: "delete", issue: {} })).toThrow(/action/);
  });
  it("requires teamId + title on create", () => {
    expect(() => buildIssueMutation({ action: "create", issue: { title: "x" } })).toThrow(/teamId/);
    expect(() => buildIssueMutation({ action: "create", issue: { teamId: "t" } })).toThrow(/title/);
  });
  it("requires id on update", () => {
    expect(() => buildIssueMutation({ action: "update", issue: { title: "x" } })).toThrow(/id/);
  });
});
