import type { RiskSeverity, VelocityTrend } from "@prisma/client";

// Single source of truth mapping domain values to the CSS custom properties
// declared in app/tokens.css. Keeps color logic out of the components.

export function severityToken(sev: RiskSeverity | null): string {
  switch (sev) {
    case "CRITICAL": return "var(--sev-critical)";
    case "HIGH": return "var(--sev-high)";
    case "MEDIUM": return "var(--sev-medium)";
    case "LOW": return "var(--sev-low)";
    default: return "var(--surface-2)";
  }
}

export function trendToken(t: VelocityTrend): string {
  switch (t) {
    case "RISING": return "var(--sev-low)";
    case "DROPPING": return "var(--sev-critical)";
    default: return "var(--text-dim)";
  }
}

export function trendSymbol(t: VelocityTrend): string {
  switch (t) {
    case "RISING": return "▲";
    case "DROPPING": return "▼";
    default: return "▬";
  }
}
