// Pure aggregation for the Overview dashboard. This workspace tracks work by
// issue COUNT (no story points, target dates, or cycle velocity), so signal is
// derived from task status and Linear priority. Kept DB- and framework-free so
// it is unit-testable in isolation (mirrors matrix.ts / scoring.ts).

export interface TaskLite {
  status: string;
  priority?: number | null;
}

const isDone = (status: string): boolean => status === "DONE";

// Linear priority scale: 1 Urgent, 2 High, 3 Medium, 4 Low, 0/undefined None.
export type PriorityBucket = "urgent" | "high" | "medium" | "low";
export type PriorityCounts = Record<PriorityBucket, number>;

function priorityBucket(priority: number | null | undefined): PriorityBucket {
  switch (priority) {
    case 1: return "urgent";
    case 2: return "high";
    case 3: return "medium";
    default: return "low"; // 4 Low, and 0/None/unset fold into low
  }
}

/** Done vs total by issue count. `pct` is a 0..1 fraction, 0 when there are no tasks. */
export function progressOf(tasks: { status: string }[]): { done: number; total: number; pct: number } {
  const total = tasks.length;
  const done = tasks.filter((t) => isDone(t.status)).length;
  return { done, total, pct: total > 0 ? done / total : 0 };
}

/** Count OPEN (not DONE) tasks per priority bucket. */
export function bucketOpenByPriority(tasks: TaskLite[]): PriorityCounts {
  const counts: PriorityCounts = { urgent: 0, high: 0, medium: 0, low: 0 };
  for (const task of tasks) {
    if (isDone(task.status)) continue;
    counts[priorityBucket(task.priority)]++;
  }
  return counts;
}

/** Total open issues across all priority buckets in a row. */
export function rowOpenTotal(counts: PriorityCounts): number {
  return counts.urgent + counts.high + counts.medium + counts.low;
}

/**
 * Prep priority rows for the heatmap: drop initiatives with no open work (dead
 * rows that just pad the grid) and sort the rest busiest-first. Generic over any
 * row carrying the four bucket counts.
 */
export function rankOpenWorkRows<T extends PriorityCounts>(rows: T[]): T[] {
  return rows
    .filter((r) => rowOpenTotal(r) > 0)
    .sort((a, b) => rowOpenTotal(b) - rowOpenTotal(a));
}

export interface OverviewKpis {
  totalIssues: number;
  doneIssues: number;
  openIssues: number;
  completePct: number; // 0..1
  urgentHighOpen: number; // open tasks at priority 1 or 2
}

/** Program-level KPI rollup from every task's status + priority. */
export function rollupKpis(tasks: TaskLite[]): OverviewKpis {
  const { done, total, pct } = progressOf(tasks);
  const urgentHighOpen = tasks.filter((t) => !isDone(t.status) && (t.priority === 1 || t.priority === 2)).length;
  return { totalIssues: total, doneIssues: done, openIssues: total - done, completePct: pct, urgentHighOpen };
}

/** Completion tier for progress-bar colouring. Higher fraction = further along. */
export type CompletionBand = "low" | "mid" | "high";
export function progressBand(pct: number): CompletionBand {
  if (pct >= 0.67) return "high";
  if (pct >= 0.33) return "mid";
  return "low";
}
