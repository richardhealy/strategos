import { inngest } from "@/schedule/inngest";
import { syncAll } from "@/state/sync/syncEngine";
import { riskAgent } from "@/agents/risk";
import { log } from "@/logger";

// 1. Daily sync: pull all integrations, update the model, recompute risk,
//    flag new blockers.
export const dailySync = inngest.createFunction(
  { id: "daily-sync" },
  { cron: "0 6 * * *" },
  async ({ step }) => {
    const synced = await step.run("sync-all", () => syncAll());
    await step.run("score-risk", () =>
      riskAgent.run({ programId: "default", logger: log.child({ run: "daily-sync" }) }),
    );
    return { synced };
  },
);
