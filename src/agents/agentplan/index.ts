import type { Agent } from "@/agents/types";
import { recordAction } from "@/state/versioned/provenance";
import { programModel } from "@/state/model/repository";
import { classifyReadiness, type ReadyTask } from "@/agents/agentplan/readiness";
import { planWaves } from "@/agents/agentplan/waves";
import { dispatchRationale } from "@/agents/agentplan/rationale";
import { hitl } from "@/hitl/gate";

export interface AiInitiative { id: string; externalId: string; title: string }
export interface AgentPlanOutput { planned: number }

const OPEN = new Set(["BACKLOG", "PLANNED", "IN_PROGRESS", "IN_REVIEW", "BLOCKED"]);

// Per AI initiative: classify open tickets for readiness, wave the READY ones by
// declared precedence, and emit a DISPATCH_PLAN proposal for HITL. No writes.
export const agentPlanner: Agent<AiInitiative, AgentPlanOutput> = {
  name: "agent-planner",
  async run(ctx, init) {
    const { tasks, edges } = await programModel.agentTasks(init.id);
    const open = tasks.filter((t) => OPEN.has(t.status));

    // Re-classify only tickets not yet classified (cost control).
    const stale = open.filter((t) => !t.readiness);
    const toClassify: ReadyTask[] = stale.map((t) => ({ externalId: t.externalId, title: t.title, description: t.description }));
    const verdicts = await classifyReadiness(toClassify);
    for (const v of verdicts) await programModel.saveReadiness(v.externalId, v.status, v.reason);

    const readinessById = new Map<string, string>(open.map((t) => [t.externalId, t.readiness ?? "NEEDS_SPEC"]));
    for (const v of verdicts) readinessById.set(v.externalId, v.status);

    const readyIds = open.map((t) => t.externalId).filter((id) => readinessById.get(id) === "READY");
    const counts = { ready: 0, needs_spec: 0, blocked: 0 };
    for (const t of open) {
      const r = readinessById.get(t.externalId);
      if (r === "READY") counts.ready++;
      else if (r === "BLOCKED") counts.blocked++;
      else counts.needs_spec++;
    }

    if (readyIds.length === 0) {
      ctx.logger.info("agent-plan: no ready tickets", { initiative: init.externalId });
      return { planned: 0 };
    }

    const { waves, cyclic } = planWaves(readyIds, edges);
    const rationale = (await dispatchRationale(init.title, waves.length, readyIds.length))
      + (cyclic.length ? ` (broke a dependency cycle among ${cyclic.length} tickets)` : "");

    await hitl.propose({
      kind: "DISPATCH_PLAN",
      summary: `Dispatch plan for ${init.title}: ${readyIds.length} ready in ${waves.length} wave(s)`,
      createdBy: "agent-planner",
      payload: { initiativeExternalId: init.externalId, waves, readiness: counts, rationale },
    });
    await recordAction({ actor: "agent-planner", action: "dispatch-plan", detail: { initiative: init.externalId, ready: readyIds.length, waves: waves.length } });
    return { planned: readyIds.length };
  },
};
