import type { RawInitiative, RawEpic, RawTask, DeliveryEvent } from "@/integrations/types";

export const GENERAL_EPIC_SUFFIX = "::general";

export interface LinearProject { id: string; name: string; leadName?: string; targetDate?: string; state?: string }
export interface LinearMilestone { id: string; name: string; projectId: string; targetDate?: string }
export interface LinearIssue {
  id: string; title: string; projectId?: string; milestoneId?: string; teamKey?: string;
  estimate?: number; assigneeName?: string; stateType?: string; stateName?: string;
  updatedAt?: string; blockedByIssueIds?: string[]; priority?: number;
}
export interface LinearCycleDelivery { teamKey: string; completedPoints: number; committedPoints: number; startsAt: string; endsAt: string }

export function mapProject(p: LinearProject): RawInitiative {
  return { externalId: p.id, title: p.name, owner: p.leadName, status: p.state ?? "unknown", targetDate: p.targetDate };
}

export function mapMilestone(m: LinearMilestone): RawEpic {
  return { externalId: m.id, initiativeExternalId: m.projectId, title: m.name, status: "active", targetDate: m.targetDate };
}

export function generalEpicFor(projectId: string): RawEpic {
  return { externalId: `${projectId}${GENERAL_EPIC_SUFFIX}`, initiativeExternalId: projectId, title: "General", status: "active" };
}

export function epicExternalIdForIssue(i: LinearIssue): string {
  return i.milestoneId ?? `${i.projectId ?? "orphan"}${GENERAL_EPIC_SUFFIX}`;
}

export function mapIssue(i: LinearIssue): RawTask {
  return {
    externalId: i.id,
    epicExternalId: epicExternalIdForIssue(i),
    title: i.title,
    status: i.stateType ?? "unknown",
    estimatePoints: i.estimate,
    assignee: i.assigneeName,
    updatedAt: i.updatedAt,
  };
}

export function mapCycle(c: LinearCycleDelivery): DeliveryEvent {
  return { teamKey: c.teamKey, points: c.completedPoints, completedAt: c.endsAt };
}
