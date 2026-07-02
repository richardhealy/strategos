import type { Agent, AgentContext } from "@/agents/types";
import { programModel } from "@/state/model/repository";
import { scoreScheduleRisk } from "@/agents/risk/scoring";
import { recordAction } from "@/state/versioned/provenance";

// Scores schedule/dependency/blocker/team risk over the program model and
// writes RiskScore rows. Critical items are handed to the escalator.
export const riskAgent: Agent<void, { flagged: number }> = {
  name: "risk",
  async run(ctx: AgentContext) {
    ctx.logger.info("scoring risk");
    const initiatives = await programModel.initiativesWithOpenWork(ctx.programId);
    let flagged = 0;

    for (const _init of initiatives) {
      // TODO(M4): derive remaining points, velocity, and sprints from the model,
      // then persist scoreScheduleRisk(...) plus dependency/blocker/team scores.
      flagged += 0;
    }

    await recordAction({ actor: "risk", action: "score", detail: { flagged } });
    return { flagged };
  },
};

export { scoreScheduleRisk } from "@/agents/risk/scoring";
