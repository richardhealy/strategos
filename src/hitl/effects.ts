import { hitl } from "@/hitl/gate";

let registered = false;

// Register a simulated effect per proposal kind so an APPROVED proposal can be
// APPLIED end-to-end for the demo. These stand in for real sends/writes; the
// HITL gate remains the single choke point for any outward action.
export function registerDemoEffects(): void {
  if (registered) return;
  registered = true;
  hitl.register("COMMUNICATION", async () => ({ ref: "sent:simulated" }));
  hitl.register("PLAN_CHANGE", async () => ({ ref: "plan:updated" }));
  hitl.register("TICKET_WRITE", async () => ({ ref: "ticket:simulated" }));
}
