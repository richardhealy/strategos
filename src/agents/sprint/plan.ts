export interface CandidateTask {
  externalId: string;
  title: string;
  priority: number | null;
  createdAt: Date;
  status: string;
}

export interface SprintSelection {
  taskExternalIds: string[];
  capacityTarget: number;
}

const OPEN_STATUSES = new Set(["BACKLOG", "PLANNED", "IN_PROGRESS", "IN_REVIEW", "BLOCKED"]);

// Exclude done work and anything already in the active sprint proposal.
export function selectCandidates(tasks: CandidateTask[], activeExternalIds: string[]): CandidateTask[] {
  const active = new Set(activeExternalIds);
  return tasks.filter((t) => OPEN_STATUSES.has(t.status) && !active.has(t.externalId));
}

// Linear priority: 1=Urgent … 4=Low, 0/none = no priority. Urgent first, none last.
function rank(p: number | null): number {
  return p == null || p === 0 ? 5 : p;
}

export function prioritize(tasks: CandidateTask[]): CandidateTask[] {
  return [...tasks].sort(
    (a, b) => rank(a.priority) - rank(b.priority) || a.createdAt.getTime() - b.createdAt.getTime(),
  );
}

// Cold start: seed. Else the rounded mean of the last 3 completed counts, floored at 1.
export function proposeCapacity(completedCounts: number[], seed: number): number {
  if (completedCounts.length === 0) return seed;
  const recent = completedCounts.slice(-3);
  const avg = recent.reduce((s, n) => s + n, 0) / recent.length;
  return Math.max(1, Math.round(avg));
}

export function fillSprint(prioritized: CandidateTask[], capacity: number): SprintSelection {
  const chosen = prioritized.slice(0, Math.max(0, capacity));
  return { taskExternalIds: chosen.map((t) => t.externalId), capacityTarget: capacity };
}

// Window starts at midnight of `now` (the cron fires Monday, so cron runs align
// to Monday; on-demand runs start today) and spans lengthDays.
export function sprintWindow(lengthDays: number, now: Date): { startsAt: string; endsAt: string } {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + lengthDays);
  return { startsAt: start.toISOString(), endsAt: end.toISOString() };
}
