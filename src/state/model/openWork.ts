// Open-work matrix: initiatives × priority, counting tasks that aren't done yet.
// The three balance fixes the Overview needs live here, out of the component, so
// they're pure and testable: drop initiatives with no open prioritised work,
// sort by volume, and rank-scale each cell's intensity so one outlier initiative
// can't flatten the colour ramp for everyone else.

export const PRIORITY_BUCKETS = [
  { key: 1, label: "Urgent", token: "var(--sev-critical)" },
  { key: 2, label: "High", token: "var(--sev-high)" },
  { key: 3, label: "Med", token: "var(--sev-medium)" },
  { key: 4, label: "Low", token: "var(--sev-low)" },
] as const;

export interface OpenWorkCell { priority: number; count: number; intensity: number }
export interface OpenWorkRow { id: string; title: string; total: number; cells: OpenWorkCell[] }

interface TaskLite { priority: number | null; status: string }
interface InitLite { id: string; title: string; tasks: TaskLite[] }

// A task counts as open until it's DONE or CANCELLED.
const isOpen = (status: string) => status !== "DONE" && status !== "CANCELLED";

// Cell intensity floors so the smallest non-zero count still reads, and caps
// below 1 so the busiest cell stays legible rather than pure saturated.
const FLOOR = 0.2;
const RANGE = 0.75;

export function buildOpenWorkMatrix(inits: InitLite[]): OpenWorkRow[] {
  const rows = inits
    .map((i) => {
      const cells: OpenWorkCell[] = PRIORITY_BUCKETS.map((b) => ({
        priority: b.key,
        count: i.tasks.filter((t) => isOpen(t.status) && t.priority === b.key).length,
        intensity: 0,
      }));
      const total = cells.reduce((s, c) => s + c.count, 0);
      return { id: i.id, title: i.title, total, cells };
    })
    .filter((r) => r.total > 0) // fix 1: no dead rows
    .sort((a, b) => b.total - a.total); // fix 2: busiest first

  // fix 3: rank-based (quantile) intensity across every non-zero cell. Equal
  // counts share a rank, so a single 419-issue initiative can't wash the rest
  // to near-black the way a max-anchored scale does.
  const uniq = [...new Set(rows.flatMap((r) => r.cells.map((c) => c.count)).filter((n) => n > 0))].sort((a, b) => a - b);
  const rankOf = new Map(uniq.map((v, i) => [v, uniq.length <= 1 ? 1 : i / (uniq.length - 1)]));
  for (const r of rows) {
    for (const c of r.cells) {
      c.intensity = c.count === 0 ? 0 : FLOOR + RANGE * (rankOf.get(c.count) ?? 0);
    }
  }
  return rows;
}
