import type { VelocityTrend } from "@prisma/client";

// Pure velocity helpers, mirroring scoring.ts: no DB, no LLM, fully testable.

/** Mean completed points across the last up-to-3 periods. 0 when empty. */
export function velocityPerSprint(completed: number[]): number {
  if (completed.length === 0) return 0;
  const recent = completed.slice(-3);
  return recent.reduce((a, b) => a + b, 0) / recent.length;
}

/** Direction of travel from first to last period, with a 10% dead-band. */
export function velocityTrend(completed: number[]): VelocityTrend {
  if (completed.length < 2) return "STABLE";
  const first = completed[0] ?? 0;
  const last = completed.at(-1) ?? 0;
  const change = (last - first) / Math.max(first, 1);
  if (change > 0.1) return "RISING";
  if (change < -0.1) return "DROPPING";
  return "STABLE";
}
