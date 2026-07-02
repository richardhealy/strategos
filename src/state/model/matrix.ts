import type { RiskKind, RiskSeverity } from "@prisma/client";

export const RISK_KINDS: RiskKind[] = ["SCHEDULE", "DEPENDENCY", "BLOCKER", "TEAM"];

const SEVERITY_ORDER: Record<RiskSeverity, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };

export interface MatrixInitiative {
  id: string;
  title: string;
  riskScores: { kind: RiskKind; severity: RiskSeverity }[];
}
export interface MatrixCell { kind: RiskKind; severity: RiskSeverity | null }
export interface MatrixRow { id: string; title: string; cells: MatrixCell[] }

/** Highest severity in the list; LOW when empty. */
export function worstSeverity(sevs: RiskSeverity[]): RiskSeverity {
  return sevs.reduce<RiskSeverity>(
    (worst, s) => (SEVERITY_ORDER[s] > SEVERITY_ORDER[worst] ? s : worst),
    "LOW",
  );
}

/** Turn initiatives + their risk scores into an initiative × risk-kind grid. */
export function buildRiskMatrix(inits: MatrixInitiative[]): MatrixRow[] {
  return inits.map((i) => ({
    id: i.id,
    title: i.title,
    cells: RISK_KINDS.map((kind) => {
      const sevs = i.riskScores.filter((r) => r.kind === kind).map((r) => r.severity);
      return { kind, severity: sevs.length ? worstSeverity(sevs) : null };
    }),
  }));
}
