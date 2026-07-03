import type { RawInitiative, RawEpic, RawTask, DeliveryEvent } from "@/integrations/types";
import { linearClient } from "@/integrations/linear/client";
import {
  mapProject, mapMilestone, generalEpicFor, mapIssue, mapCycle,
  type LinearProject, type LinearMilestone, type LinearIssue, type LinearCycleDelivery,
} from "@/integrations/linear/map";
import { log } from "@/logger";

const logger = log.child({ integration: "linear", op: "pull" });
const PAGE = 100;

// Walk a Linear connection to completion. `fetchPage` returns { nodes, pageInfo }.
async function collect<T>(fetchPage: (after?: string) => Promise<{ nodes: T[]; pageInfo: { hasNextPage: boolean; endCursor?: string | null } }>): Promise<T[]> {
  const out: T[] = [];
  let after: string | undefined;
  for (;;) {
    const page = await fetchPage(after);
    out.push(...page.nodes);
    if (!page.pageInfo.hasNextPage || !page.pageInfo.endCursor) break;
    after = page.pageInfo.endCursor;
  }
  return out;
}

// Projects for the configured teams. A Linear project can belong to several
// teams; we include it if any of its teams is configured.
export async function pullProjects(teamKeys: string[]): Promise<RawInitiative[]> {
  const client = linearClient();
  const projects = await collect((after) => client.projects({ first: PAGE, after }));
  const raw: LinearProject[] = [];
  for (const p of projects) {
    const teams = await p.teams();
    const keys = teams.nodes.map((t) => t.key);
    if (teamKeys.length && !keys.some((k) => teamKeys.includes(k))) continue;
    const lead = p.lead ? await p.lead : undefined;
    raw.push({ id: p.id, name: p.name, leadName: lead?.name, targetDate: p.targetDate ?? undefined, state: p.state ?? undefined });
  }
  logger.info("pulled projects", { count: raw.length });
  return raw.map(mapProject);
}

// Milestones for the in-scope projects (same team filter as projects).
export async function pullMilestones(teamKeys: string[]): Promise<RawEpic[]> {
  const client = linearClient();
  const projects = await collect((after) => client.projects({ first: PAGE, after }));
  const epics: RawEpic[] = [];
  for (const p of projects) {
    const teams = await p.teams();
    const keys = teams.nodes.map((t) => t.key);
    if (teamKeys.length && !keys.some((k) => teamKeys.includes(k))) continue;
    // one General epic per project for un-milestoned issues
    epics.push(generalEpicFor(p.id));
    const milestones = await p.projectMilestones();
    for (const m of milestones.nodes) {
      const raw: LinearMilestone = { id: m.id, name: m.name, projectId: p.id, targetDate: m.targetDate ?? undefined };
      epics.push(mapMilestone(raw));
    }
  }
  logger.info("pulled milestones", { count: epics.length });
  return epics;
}

// Issues for the configured teams.
export async function pullIssues(teamKeys: string[]): Promise<RawTask[]> {
  const client = linearClient();
  const issues = await collect((after) => client.issues({ first: PAGE, after }));
  const raw: LinearIssue[] = [];
  for (const i of issues) {
    const team = i.team ? await i.team : undefined;
    if (teamKeys.length && (!team || !teamKeys.includes(team.key))) continue;
    const project = i.project ? await i.project : undefined;
    const milestone = i.projectMilestone ? await i.projectMilestone : undefined;
    const assignee = i.assignee ? await i.assignee : undefined;
    const state = i.state ? await i.state : undefined;
    raw.push({
      id: i.id, title: i.title, projectId: project?.id, milestoneId: milestone?.id, teamKey: team?.key,
      estimate: i.estimate ?? undefined, assigneeName: assignee?.name,
      stateType: state?.type, stateName: state?.name, updatedAt: i.updatedAt?.toISOString(), priority: i.priority,
    });
  }
  logger.info("pulled issues", { count: raw.length });
  // Only issues that belong to a project map cleanly; drop the rest (inbox/triage).
  return raw.filter((i) => i.projectId).map(mapIssue);
}

// Completed cycles → per-team delivery for velocity.
export async function pullDelivery(teamKeys: string[]): Promise<DeliveryEvent[]> {
  const client = linearClient();
  const cycles = await collect((after) => client.cycles({ first: PAGE, after }));
  const out: LinearCycleDelivery[] = [];
  for (const c of cycles) {
    const team = c.team ? await c.team : undefined;
    if (!team) continue;
    if (teamKeys.length && !teamKeys.includes(team.key)) continue;
    if (!c.endsAt || c.endsAt.getTime() > Date.now()) continue; // completed cycles only
    out.push({
      teamKey: team.key,
      completedPoints: c.completedScopeHistory?.at(-1) ?? 0,
      committedPoints: c.scopeHistory?.at(-1) ?? 0,
      startsAt: c.startsAt.toISOString(),
      endsAt: c.endsAt.toISOString(),
    });
  }
  logger.info("pulled delivery", { count: out.length });
  return out.map(mapCycle);
}
