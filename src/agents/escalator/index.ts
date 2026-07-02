import type { Agent, AgentContext } from "@/agents/types";
import { recordAction } from "@/state/versioned/provenance";

export interface EscalatorInput { riskScoreIds: string[] }
export interface EscalatorOutput { escalated: number }

// Applies escalation policy: CRITICAL risk items are pushed to the HITL queue
// and (M5+) surfaced via the communicator to the right owner.
export const escalatorAgent: Agent<EscalatorInput, EscalatorOutput> = {
  name: "escalator",
  async run(ctx: AgentContext, input: EscalatorInput) {
    ctx.logger.info("evaluating escalations", { candidates: input.riskScoreIds.length });
    // TODO(M4): route by severity + policy; mark RiskScore.escalated.
    await recordAction({ actor: "escalator", action: "route", detail: { count: input.riskScoreIds.length } });
    return { escalated: 0 };
  },
};
