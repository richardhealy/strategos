import type { Agent, AgentContext } from "@/agents/types";
import { complete } from "@/llm/client";
import { recordAction } from "@/state/versioned/provenance";

export interface PlannerInput { prd: string }
export interface PlannedEpic {
  title: string;
  tasks: string[];
  estimatePoints?: number;
  dependsOn?: string[];
}
export interface PlannerOutput { epics: PlannedEpic[]; timelineNote: string }

// Decomposes a PRD into epics/tasks with a timeline and dependency hints.
// Produces a PLAN_CHANGE proposal for HITL rather than writing tickets.
export const plannerAgent: Agent<PlannerInput, PlannerOutput> = {
  name: "planner",
  async run(ctx: AgentContext, input: PlannerInput) {
    ctx.logger.info("planning from PRD", { chars: input.prd.length });
    const raw = await complete({
      system:
        "You are a technical program planner. Decompose the PRD into epics and " +
        "tasks with rough point estimates and dependency hints. Reply as strict " +
        "JSON: {\"epics\":[{\"title\":\"\",\"tasks\":[\"\"],\"estimatePoints\":0,\"dependsOn\":[\"\"]}],\"timelineNote\":\"\"}.",
      prompt: input.prd,
    });

    let parsed: PlannerOutput;
    try {
      parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
    } catch {
      parsed = { epics: [], timelineNote: "Planner returned unparseable output." };
    }

    await recordAction({ actor: "planner", action: "decompose", detail: { epics: parsed.epics.length } });
    return parsed;
  },
};
