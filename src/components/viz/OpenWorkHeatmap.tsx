import { Fragment } from "react";
import { PRIORITY_BUCKETS, type OpenWorkRow } from "@/state/model/openWork";

// initiative × priority grid of open-task counts. Empty rows are already dropped
// and rows sorted upstream (buildOpenWorkMatrix); here we just render, blending
// each column's severity hue with the surface by the cell's rank-scaled intensity.
export function OpenWorkHeatmap({ rows }: { rows: OpenWorkRow[] }) {
  if (!rows.length) return <span style={{ color: "var(--text-dim)" }}>No open prioritised work.</span>;
  return (
    <div style={{ display: "grid", gridTemplateColumns: `140px repeat(${PRIORITY_BUCKETS.length}, 1fr)`, gap: 4, alignItems: "center" }}>
      <div />
      {PRIORITY_BUCKETS.map((b) => (
        <div key={b.key} style={{ fontSize: 10, color: "var(--text-faint)", textAlign: "center" }}>{b.label}</div>
      ))}
      {rows.map((row) => (
        <Fragment key={row.id}>
          <div title={row.title} style={{ fontSize: 12, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.title}</div>
          {row.cells.map((c, i) => {
            const bucket = PRIORITY_BUCKETS[i]!;
            return (
              <div
                key={c.priority}
                title={`${row.title} · ${bucket.label}: ${c.count} open`}
                style={{
                  height: 22, borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 600, color: c.count ? "var(--text)" : "transparent",
                  background: c.count
                    ? `color-mix(in srgb, ${bucket.token} ${Math.round(c.intensity * 100)}%, var(--surface-2))`
                    : "var(--surface-2)",
                }}
              >
                {c.count || ""}
              </div>
            );
          })}
        </Fragment>
      ))}
    </div>
  );
}
