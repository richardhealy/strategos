import { inngest } from "@/schedule/inngest";
import { sprintAgent } from "@/agents/sprint";
import { log } from "@/logger";

// 2. Sprint cadence: start (plan), mid (monitor), end (retro + velocity).
export const sprintCadence = inngest.createFunction(
  { id: "sprint-cadence" },
  { cron: "0 9 * * 1" },
  async ({ step }) => {
    return step.run("plan-sprint", () =>
      sprintAgent.run({ programId: "default", logger: log.child({ run: "sprint-cadence" }) }),
    );
  },
);
