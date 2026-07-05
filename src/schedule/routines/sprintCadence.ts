import { inngest } from "@/schedule/inngest";
import { runPlanning } from "@/agents/planRouter";
import { programModel } from "@/state/model/repository";
import { log } from "@/logger";

// Weekly planning: one human sprint across HUMAN projects + a dispatch plan per AI project.
export const sprintCadence = inngest.createFunction(
  { id: "sprint-cadence" },
  { cron: "0 9 * * 1" },
  async ({ step }) =>
    step.run("plan", async () => {
      const programId = await programModel.primaryProgramId();
      if (!programId) return { human: { planned: 0, blockers: 0 }, ai: [] };
      return runPlanning(programId, log.child({ run: "sprint-cadence" }));
    }),
);
