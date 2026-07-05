import type { RawInitiative, RawEpic, RawTask, DeliveryEvent } from "@/integrations/types";
import { linearClient } from "@/integrations/linear/client";
import {
  mapProject, mapMilestone, generalEpicFor, mapIssue, mapCycle,
  type LinearProject, type LinearMilestone, type LinearIssue, type LinearCycleDelivery,
} from "@/integrations/linear/map";
import { sprintConfig } from "@/config/sprint";
import { agentModeConfig } from "@/config/agentmode";
import { log } from "@/logger";

const logger = log.child({ integration: "linear", op: "pull" });
const PAGE = 100;
// Projects nest two connections (teams, milestones), so Linear's per-query
// complexity budget (10k) is hit fast — page projects smaller and cap the
// nested connections. Issues/cycles nest only single objects, so they stay at PAGE.
const PROJECT_PAGE = 20;

type Connection<T> = { nodes: T[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } };
interface GqlResponse<T> { data?: Record<string, Connection<T>>; errors?: { message: string }[] }

// Walk a Linear GraphQL connection to completion. Every field we need is
// selected in the query itself, so this is ONE request per page — no lazy
// per-entity round-trips (which previously fanned out to ~5 requests per issue
// and blew Linear's 2500/hour rate limit).
async function paginate<T>(query: string, field: string): Promise<T[]> {
  const client = linearClient();
  const out: T[] = [];
  let after: string | null = null;
  for (;;) {
    const res = (await client.client.rawRequest(query, { after })) as unknown as GqlResponse<T>;
    if (res.errors?.length) throw new Error(res.errors.map((e) => e.message).join("; "));
    const conn = res.data?.[field];
    if (!conn) throw new Error(`Linear GraphQL: response missing '${field}'`);
    out.push(...conn.nodes);
    if (!conn.pageInfo.hasNextPage || !conn.pageInfo.endCursor) break;
    after = conn.pageInfo.endCursor;
  }
  return out;
}

// ---- GraphQL node shapes (only the fields we map) ----
interface ProjectNode {
  id: string; name: string; targetDate: string | null; state: string | null;
  lead: { name: string } | null;
  teams: { nodes: { key: string }[] };
  projectMilestones: { nodes: { id: string; name: string; targetDate: string | null }[] };
  labels: { nodes: { name: string }[] };
}
interface IssueNode {
  id: string; title: string; estimate: number | null; updatedAt: string; priority: number | null;
  team: { key: string } | null;
  project: { id: string } | null;
  projectMilestone: { id: string } | null;
  assignee: { name: string } | null;
  state: { type: string; name: string } | null;
  description: string | null;
  inverseRelations: { nodes: { type: string; issue: { id: string } | null }[] };
}
interface CycleNode {
  startsAt: string; endsAt: string | null;
  completedScopeHistory: number[]; scopeHistory: number[];
  team: { key: string } | null;
}

const PROJECTS_QUERY = `
  query Projects($after: String) {
    projects(first: ${PROJECT_PAGE}, after: $after) {
      nodes {
        id name targetDate state
        lead { name }
        teams(first: 10) { nodes { key } }
        projectMilestones(first: 50) { nodes { id name targetDate } }
        labels(first: 10) { nodes { name } }
      }
      pageInfo { hasNextPage endCursor }
    }
  }`;

const ISSUES_QUERY = `
  query Issues($after: String) {
    issues(first: ${PAGE}, after: $after) {
      nodes {
        id title estimate updatedAt priority
        team { key }
        project { id }
        projectMilestone { id }
        assignee { name }
        state { type name }
        description
        inverseRelations(first: 10) { nodes { type issue { id } } }
      }
      pageInfo { hasNextPage endCursor }
    }
  }`;

const CYCLES_QUERY = `
  query Cycles($after: String) {
    cycles(first: ${PAGE}, after: $after) {
      nodes {
        startsAt endsAt
        completedScopeHistory scopeHistory
        team { key }
      }
      pageInfo { hasNextPage endCursor }
    }
  }`;

// Unscoped (empty teamKeys) means "all teams"; otherwise keep if any team matches.
function inScope(teamKeys: string[], keys: string[]): boolean {
  return !teamKeys.length || keys.some((k) => teamKeys.includes(k));
}

// Projects for the configured teams. A Linear project can belong to several
// teams; we include it if any of its teams is configured.
export async function pullProjects(teamKeys: string[]): Promise<RawInitiative[]> {
  const label = sprintConfig().label;
  const projects = await paginate<ProjectNode>(PROJECTS_QUERY, "projects");
  const raw: LinearProject[] = [];
  for (const p of projects) {
    if (!inScope(teamKeys, p.teams.nodes.map((t) => t.key))) continue;
    const managed = p.labels.nodes.some((l) => l.name === label);
    const mode = p.labels.nodes.some((l) => l.name === agentModeConfig().label) ? "AI" : "HUMAN";
    raw.push({ id: p.id, name: p.name, leadName: p.lead?.name, targetDate: p.targetDate ?? undefined, state: p.state ?? undefined, managed, mode });
  }
  logger.info("pulled projects", { count: raw.length });
  return raw.map(mapProject);
}

// Milestones for the in-scope projects (same team filter as projects), plus one
// General epic per project to hold un-milestoned issues.
export async function pullMilestones(teamKeys: string[]): Promise<RawEpic[]> {
  const projects = await paginate<ProjectNode>(PROJECTS_QUERY, "projects");
  const epics: RawEpic[] = [];
  for (const p of projects) {
    if (!inScope(teamKeys, p.teams.nodes.map((t) => t.key))) continue;
    epics.push(generalEpicFor(p.id));
    for (const m of p.projectMilestones.nodes) {
      const raw: LinearMilestone = { id: m.id, name: m.name, projectId: p.id, targetDate: m.targetDate ?? undefined };
      epics.push(mapMilestone(raw));
    }
  }
  logger.info("pulled milestones", { count: epics.length });
  return epics;
}

// Issues for the configured teams.
export async function pullIssues(teamKeys: string[]): Promise<RawTask[]> {
  const issues = await paginate<IssueNode>(ISSUES_QUERY, "issues");
  const raw: LinearIssue[] = [];
  for (const i of issues) {
    if (teamKeys.length && (!i.team || !teamKeys.includes(i.team.key))) continue;
    raw.push({
      id: i.id, title: i.title, projectId: i.project?.id, milestoneId: i.projectMilestone?.id, teamKey: i.team?.key,
      estimate: i.estimate ?? undefined, assigneeName: i.assignee?.name,
      stateType: i.state?.type, stateName: i.state?.name, updatedAt: i.updatedAt, priority: i.priority ?? undefined,
      description: i.description ?? undefined,
      blockerExternalIds: (i.inverseRelations?.nodes ?? []).filter((r) => r.type === "blocks" && r.issue).map((r) => r.issue!.id),
    });
  }
  logger.info("pulled issues", { count: raw.length });
  // Only issues that belong to a project map cleanly; drop the rest (inbox/triage).
  return raw.filter((i) => i.projectId).map(mapIssue);
}

// Completed cycles → per-team delivery for velocity.
export async function pullDelivery(teamKeys: string[]): Promise<DeliveryEvent[]> {
  const cycles = await paginate<CycleNode>(CYCLES_QUERY, "cycles");
  const out: LinearCycleDelivery[] = [];
  for (const c of cycles) {
    if (!c.team) continue;
    if (teamKeys.length && !teamKeys.includes(c.team.key)) continue;
    if (!c.endsAt || new Date(c.endsAt).getTime() > Date.now()) continue; // completed cycles only
    out.push({
      teamKey: c.team.key,
      completedPoints: c.completedScopeHistory?.at(-1) ?? 0,
      committedPoints: c.scopeHistory?.at(-1) ?? 0,
      startsAt: c.startsAt,
      endsAt: c.endsAt,
    });
  }
  logger.info("pulled delivery", { count: out.length });
  return out.map(mapCycle);
}
