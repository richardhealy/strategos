import type { VelocityTrend } from "@prisma/client";
import { trendToken, trendSymbol } from "@/components/viz/tokens";

export function VelocityBars({ teams }: { teams: { name: string; completed: number[]; trend: VelocityTrend }[] }) {
  const max = Math.max(1, ...teams.flatMap((t) => t.completed));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {teams.map((t) => (
        <div key={t.name}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
            <span style={{ color: "var(--text-dim)" }}>{t.name}</span>
            <span style={{ color: trendToken(t.trend) }}>{trendSymbol(t.trend)} {t.trend.toLowerCase()}</span>
          </div>
          <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 24, marginTop: 3 }}>
            {t.completed.map((v, i) => (
              <div key={i} style={{ flex: 1, height: `${(v / max) * 100}%`, background: "var(--accent)", borderRadius: 1, minHeight: 2 }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
