import type { Agent } from "@/agents/types";
import { recordAction } from "@/state/versioned/provenance";
import { programModel } from "@/state/model/repository";
import { sprintConfig } from "@/config/sprint";
import { selectCandidates, prioritize, proposeCapacity, fillSprint, sprintWindow } from "@/agents/sprint/plan";
import { sprintRationale } from "@/agents/sprint/rationale";
import { hitl } from "@/hitl/gate";

export interface SprintOutput { planned: number; blockers: number }

// Plans one rolling sprint from managed-project backlog and emits a SPRINT_PLAN
// proposal for HITL. Selection is deterministic; the LLM only writes rationale.
// No Linear writes here — applying is the HITL effect (Phase 3).
export const sprintAgent: Agent<void, SprintOutput> = {
  name: "sprint",
  async run(ctx) {
    const cfg = sprintConfig();
    const now = new Date();
    const all = await programModel.candidateTasksForSprint(ctx.programId);
    const activeIds = await programModel.activeSprintTaskIds(now);
    const candidates = selectCandidates(all, activeIds);
    if (candidates.length === 0) {
      ctx.logger.info("sprint: no candidate tasks; nothing to propose");
      return { planned: 0, blockers: 0 };
    }
    const history = await programModel.completedSprintCounts(ctx.programId);
    const capacity = proposeCapacity(history, cfg.seedCapacity);
    const selection = fillSprint(prioritize(candidates), capacity);
    const window = sprintWindow(cfg.lengthDays, now);
    const index = (await programModel.sprintCount()) + 1;
    const rationale = await sprintRationale(candidates, selection);

    await hitl.propose({
      kind: "SPRINT_PLAN",
      summary: `Sprint ${index}: ${selection.taskExternalIds.length} tickets (${window.startsAt.slice(0, 10)} → ${window.endsAt.slice(0, 10)})`,
      createdBy: "sprint",
      payload: {
        index,
        startsAt: window.startsAt,
        endsAt: window.endsAt,
        capacityTarget: selection.capacityTarget,
        taskExternalIds: selection.taskExternalIds,
        rationale,
        teamKey: cfg.team,
      },
    });
    await recordAction({ actor: "sprint", action: "plan", detail: { index, count: selection.taskExternalIds.length } });
    return { planned: selection.taskExternalIds.length, blockers: 0 };
  },
};
