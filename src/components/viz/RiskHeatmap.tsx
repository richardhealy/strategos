import { Fragment } from "react";
import { RISK_KINDS, type MatrixRow } from "@/state/model/matrix";
import { severityToken } from "@/components/viz/tokens";

const LABEL: Record<string, string> = { SCHEDULE: "Sched", DEPENDENCY: "Dep", BLOCKER: "Block", TEAM: "Team" };

export function RiskHeatmap({ rows }: { rows: MatrixRow[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `120px repeat(${RISK_KINDS.length}, 1fr)`, gap: 4, alignItems: "center" }}>
      <div />
      {RISK_KINDS.map((k) => (
        <div key={k} style={{ fontSize: 9, color: "var(--text-faint)", textAlign: "center" }}>{LABEL[k]}</div>
      ))}
      {rows.map((row) => (
        <Fragment key={row.id}>
          <div style={{ fontSize: 12, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.title}</div>
          {row.cells.map((c) => (
            <div key={`${row.id}-${c.kind}`} title={`${row.title} · ${c.kind}: ${c.severity ?? "none"}`}
                 style={{ height: 18, background: severityToken(c.severity), borderRadius: 3 }} />
          ))}
        </Fragment>
      ))}
    </div>
  );
}
