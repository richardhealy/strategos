import type { RiskSeverity } from "@prisma/client";

// Pure functions so risk logic is unit-testable without a database or an LLM.
// The spec requires a schedule-risk flag to fire BEFORE a delivery slip; that
// behaviour is pinned by tests/risk.scoring.test.ts.

export interface ScheduleInput {
  remainingPoints: number;
  velocityPerSprint: number; // completed points per sprint, from history
  sprintsRemaining: number;   // until the target date
}

export interface ScheduleRisk {
  score: number;       // 0..1, higher is worse
  severity: RiskSeverity;
  willSlip: boolean;
  explanation: string;
}

export function scoreScheduleRisk(input: ScheduleInput): ScheduleRisk {
  const { remainingPoints, velocityPerSprint, sprintsRemaining } = input;
  const capacity = Math.max(velocityPerSprint, 0) * Math.max(sprintsRemaining, 0);

  // Ratio of work to capacity. >1 means the team cannot finish in time.
  const ratio = capacity <= 0 ? Infinity : remainingPoints / capacity;
  const willSlip = ratio > 1;

  // Map ratio to a bounded 0..1 score.
  const score = Number.isFinite(ratio) ? Math.min(1, ratio / 2) : 1;
  const severity = toSeverity(score);

  const explanation = willSlip
    ? `Projected shortfall: ${remainingPoints} pts remaining vs ~${capacity} pts capacity ` +
      `(${velocityPerSprint}/sprint x ${sprintsRemaining} sprints). Delivery is at risk.`
    : `On track: ${remainingPoints} pts remaining within ~${capacity} pts capacity.`;

  return { score, severity, willSlip, explanation };
}

export function toSeverity(score: number): RiskSeverity {
  if (score >= 0.85) return "CRITICAL";
  if (score >= 0.6) return "HIGH";
  if (score >= 0.3) return "MEDIUM";
  return "LOW";
}
