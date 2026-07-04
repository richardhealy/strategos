import { inngest } from "@/schedule/inngest";
import { sprintAgent } from "@/agents/sprint";
import { programModel } from "@/state/model/repository";
import { log } from "@/logger";

// 2. Sprint cadence: propose the next rolling sprint from the managed backlog.
export const sprintCadence = inngest.createFunction(
  { id: "sprint-cadence" },
  { cron: "0 9 * * 1" },
  async ({ step }) => {
    return step.run("plan-sprint", async () => {
      const programId = await programModel.primaryProgramId();
      if (!programId) return { planned: 0, blockers: 0 };
      return sprintAgent.run({ programId, logger: log.child({ run: "sprint-cadence" }) });
    });
  },
);
