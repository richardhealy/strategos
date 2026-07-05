import type { ReactNode } from "react";

// `fill` makes the panel fill its container (paired with an absolutely-sized
// grid cell) and scroll its body — used so the Blocked panel matches the
// heatmap's height instead of running long.
export function Panel({ title, hint, children, fill }: { title: string; hint?: string; children: ReactNode; fill?: boolean }) {
  return (
    <section style={{ background: "var(--surface-1)", borderRadius: "var(--radius)", padding: 14, ...(fill ? { display: "flex", flexDirection: "column", height: "100%", minHeight: 0 } : {}) }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 12, flex: "0 0 auto" }}>
        <h2 style={{ fontSize: 13, fontWeight: 600, margin: 0, color: "var(--text)" }}>{title}</h2>
        {hint && <span style={{ fontSize: 11, color: "var(--text-faint)" }}>{hint}</span>}
      </div>
      {fill ? <div className="ov-scroll" style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto" }}>{children}</div> : children}
    </section>
  );
}

export function KpiTile({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div style={{ background: "var(--surface-1)", borderRadius: "var(--radius)", padding: 12, borderTop: `2px solid ${accent ?? "var(--border)"}` }}>
      <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--text-faint)" }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: accent ?? "var(--text)", lineHeight: 1.2 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--text-dim)" }}>{sub}</div>}
    </div>
  );
}

export type BadgeTone = "low" | "medium" | "high" | "critical" | "accent" | "muted";

const TONE: Record<BadgeTone, string> = {
  low: "var(--sev-low)", medium: "var(--sev-medium)", high: "var(--sev-high)",
  critical: "var(--sev-critical)", accent: "var(--accent)", muted: "var(--text-dim)",
};
export function Badge({ tone, children }: { tone: BadgeTone; children: ReactNode }) {
  const color = TONE[tone];
  return (
    <span style={{ fontSize: 11, color, background: "var(--surface-2)", padding: "2px 8px", borderRadius: "var(--radius-sm)" }}>{children}</span>
  );
}

export function ProgressBar({ value, color }: { value: number; color: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div style={{ height: 6, background: "var(--surface-2)", borderRadius: 3, overflow: "hidden" }}>
      <div style={{ width: `${pct}%`, height: "100%", background: color }} />
    </div>
  );
}
