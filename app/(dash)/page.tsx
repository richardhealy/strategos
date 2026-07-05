import { programModel } from "@/state/model/repository";
import { pendingProposals } from "@/hitl/queue";
import { Panel, KpiTile } from "@/components/ui/primitives";
import { OpenWorkHeatmap } from "@/components/viz/OpenWorkHeatmap";

export const dynamic = "force-dynamic";

// Left border of a blocked card, keyed to its priority.
const blockerTone = (p: number | null) =>
  p === 1 ? "var(--sev-critical)" : p === 2 ? "var(--sev-high)" : p === 3 ? "var(--sev-medium)" : "var(--border)";

export default async function Overview() {
  const programId = await programModel.primaryProgramId();
  if (!programId) {
    return <p style={{ color: "var(--text-dim)" }}>No program seeded yet. Run <code>npm run db:seed</code>.</p>;
  }
  const [stats, matrix, blocked, pending] = await Promise.all([
    programModel.programStats(programId),
    programModel.openWorkMatrix(programId),
    programModel.blockedTasks(programId),
    pendingProposals(),
  ]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Program health</h1>
        <span style={{ fontSize: 11, color: "var(--text-faint)" }}>Linear · Jira · GitHub · GitLab · Azure</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
        <KpiTile label="Complete" value={`${stats.completePct}%`} sub={`${stats.done}/${stats.total} issues`} accent="var(--sev-low)" />
        <KpiTile label="Initiatives" value={stats.initiatives} sub="tracked" />
        <KpiTile label="Open issues" value={stats.openCount} sub="not yet done" />
        <KpiTile label="Urgent / High" value={stats.urgentHigh} sub="open, priority 1–2" accent="var(--sev-high)" />
        <KpiTile label="Awaiting you" value={pending.length} sub="approvals" accent="var(--accent)" />
      </div>

      {/* Equal columns: the sparse heatmap no longer hogs the width, and the
          dense Blocked list gets room to breathe. align-items:start keeps the
          short heatmap panel from stretching to the Blocked column's height. */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 10, alignItems: "start" }}>
        <Panel title="Open work by priority" hint="initiative × priority">
          <OpenWorkHeatmap rows={matrix} />
        </Panel>

        <Panel title={`Blocked (${blocked.length})`}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 560, overflowY: "auto" }}>
            {blocked.length === 0 && <span style={{ color: "var(--text-dim)" }}>Nothing blocked.</span>}
            {blocked.map((t) => (
              <div key={t.id} style={{ background: "var(--bg)", borderRadius: "var(--radius-sm)", padding: "8px 10px", borderLeft: `3px solid ${blockerTone(t.priority)}` }}>
                <div style={{ fontSize: 13 }}>{t.title}</div>
                {t.blockers.length > 0 && (
                  <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 3 }}>blocked by {t.blockers.join(", ")}</div>
                )}
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
