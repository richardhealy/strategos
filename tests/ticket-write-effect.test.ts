import { describe, it, expect, vi } from "vitest";

const writeTicket = vi.fn(async () => ({ externalId: "LIN-42", url: "https://linear.app/x/LIN-42" }));
vi.mock("@/integrations/registry", () => ({ integrationFor: vi.fn(() => ({ writeTicket })) }));

import { ticketWriteEffect } from "@/hitl/effects";
import { integrationFor } from "@/integrations/registry";

describe("ticketWriteEffect", () => {
  it("routes to the payload's integration and returns its ref", async () => {
    const payload = { kind: "LINEAR", action: "create", issue: { teamId: "t", title: "x" } };
    const res = await ticketWriteEffect(payload);
    expect(integrationFor).toHaveBeenCalledWith("LINEAR");
    expect(writeTicket).toHaveBeenCalledWith(payload);
    expect(res).toEqual({ ref: "LIN-42" });
  });
  it("throws when the payload has no kind", async () => {
    await expect(ticketWriteEffect({ action: "create" })).rejects.toThrow(/kind/);
  });
});
