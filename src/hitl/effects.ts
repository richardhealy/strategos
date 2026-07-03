import type { IntegrationKind } from "@prisma/client";
import { hitl } from "@/hitl/gate";
import { integrationFor } from "@/integrations/registry";

let registered = false;

// The real TICKET_WRITE effect: route to the integration's guarded writeTicket.
export async function ticketWriteEffect(payload: unknown): Promise<{ ref?: string }> {
  const kind = (payload as { kind?: IntegrationKind }).kind;
  if (!kind) throw new Error("TICKET_WRITE payload missing 'kind'");
  const result = await integrationFor(kind).writeTicket(payload);
  return { ref: result.externalId };
}

// COMMUNICATION and PLAN_CHANGE remain simulated (not integration actions).
// TICKET_WRITE is live and writes to the connected tracker via the HITL gate.
export function registerDemoEffects(): void {
  if (registered) return;
  registered = true;
  hitl.register("COMMUNICATION", async () => ({ ref: "sent:simulated" }));
  hitl.register("PLAN_CHANGE", async () => ({ ref: "plan:updated" }));
  hitl.register("TICKET_WRITE", ticketWriteEffect);
}
