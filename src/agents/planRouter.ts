import { programModel } from "@/state/model/repository";
import { sprintAgent } from "@/agents/sprint";
import { agentPlanner } from "@/agents/agentplan";
import type { log } from "@/logger";

// HUMAN work is one program-level sprint; AI work is one dispatch plan per AI project.
export async function runPlanning(programId: string, logger: ReturnType<typeof log.child>) {
  const human = await sprintAgent.run({ programId, logger });
  const inits = await programModel.aiInitiatives(programId);
  const ai: { initiative: string; planned: number }[] = [];
  for (const init of inits) {
    const out = await agentPlanner.run({ programId, logger }, init);
    ai.push({ initiative: init.externalId, planned: out.planned });
  }
  return { human, ai };
}
