import type { RiskSeverity } from "@prisma/client";

const PENALTY: Record<RiskSeverity, number> = { LOW: 2, MEDIUM: 6, HIGH: 12, CRITICAL: 20 };

/** 0..100 program health: full marks minus weighted risk penalties. */
export function programHealthScore(severities: RiskSeverity[]): number {
  const penalty = severities.reduce((sum, s) => sum + PENALTY[s], 0);
  return Math.max(0, 100 - penalty);
}

export function healthBand(score: number): "Healthy" | "At risk" | "Critical" {
  if (score >= 80) return "Healthy";
  if (score >= 50) return "At risk";
  return "Critical";
}
