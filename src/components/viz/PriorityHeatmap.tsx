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
  const max = Math.max(1, ...rows.flatMap((r) => COLUMNS.map((c) => r[c.key])));
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
            const mix = n === 0 ? 0 : 25 + Math.round((n / max) * 75);
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
