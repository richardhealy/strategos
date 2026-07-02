import { Inngest } from "inngest";

// Durable runtime. The scheduled routines below are the agent's heartbeat.
export const inngest = new Inngest({ id: "strategos" });
