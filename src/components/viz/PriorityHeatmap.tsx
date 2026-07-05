import { Fragment } from "react";
import type { PriorityRow } from "@/state/model/repository";
import type { PriorityBucket } from "@/state/model/overview";

// Open issues per initiative × priority. Cell shade scales with the count
// (darker = more open work at that priority); the number is shown for detail.
const COLUMNS: { key: PriorityBucket; label: string; color: string }[] = [
  { key: "urgent", label: "Urgent", color: "var(--sev-critical)" },
  { key: "high", label: "High", color: "var(--sev-high)" },
  { key: "medium", label: "Med", color: "var(--sev-medium)" },
  { key: "low", label: "Low", color: "var(--sev-low)" },
];

export function PriorityHeatmap({ rows }: { rows: PriorityRow[] }) {
  // Rank-based (quantile) shade instead of max-anchored: with a max scale one
  // outlier initiative (e.g. 170 open) pins `max` and washes every smaller cell
  // to near-nothing. Mapping distinct counts to evenly-spaced ranks keeps a 7
  // and a 170 visibly different without the outlier flattening the ramp.
  const counts = [...new Set(rows.flatMap((r) => COLUMNS.map((c) => r[c.key])).filter((n) => n > 0))].sort((a, b) => a - b);
  const rankOf = new Map(counts.map((v, i) => [v, counts.length <= 1 ? 1 : i / (counts.length - 1)]));
  return (
    <div style={{ display: "grid", gridTemplateColumns: `120px repeat(${COLUMNS.length}, 1fr)`, gap: 4, alignItems: "center" }}>
      <div />
      {COLUMNS.map((c) => (
        <div key={c.key} style={{ fontSize: 9, color: "var(--text-faint)", textAlign: "center" }}>{c.label}</div>
      ))}
      {rows.map((row) => (
        <Fragment key={row.id}>
          <div style={{ fontSize: 12, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.title}</div>
          {COLUMNS.map((c) => {
            const n = row[c.key];
            const mix = n === 0 ? 0 : 25 + Math.round((rankOf.get(n) ?? 0) * 70);
            return (
              <div key={`${row.id}-${c.key}`} title={`${row.title} · ${c.label}: ${n} open`}
                   style={{ height: 18, borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 10, color: "var(--text-dim)",
                            background: n === 0 ? "var(--surface-2)" : `color-mix(in srgb, ${c.color} ${mix}%, var(--surface-2))` }}>
                {n > 0 ? n : ""}
              </div>
            );
          })}
        </Fragment>
      ))}
    </div>
  );
}
