import type { Agent, AgentContext } from "@/agents/types";
import { recordAction } from "@/state/versioned/provenance";

export interface SprintOutput { planned: number; blockers: number }

// Plans a sprint backlog from prioritized work + team capacity, monitors
// burn-down, and detects stalled critical-path tickets.
export const sprintAgent: Agent<void, SprintOutput> = {
  name: "sprint",
  async run(ctx: AgentContext) {
    ctx.logger.info("planning sprint");
    // TODO(M3): capacity from latest VelocitySnapshot; fill to capacity by
    // priority; mark critical-path items stalled beyond avg cycle time.
    await recordAction({ actor: "sprint", action: "plan", detail: {} });
    return { planned: 0, blockers: 0 };
  },
};
