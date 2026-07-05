import { programModel } from "@/state/model/repository";
import { pendingProposals } from "@/hitl/queue";
import { Panel, KpiTile, Badge, ProgressBar, type BadgeTone } from "@/components/ui/primitives";
import { PriorityHeatmap } from "@/components/viz/PriorityHeatmap";
import { BlockedList } from "@/components/viz/BlockedList";
import type { CompletionBand } from "@/state/model/overview";
import { approveProposal, rejectProposal } from "./actions";

export const dynamic = "force-dynamic";

// Completion band → progress colour + badge tone. Higher completion reads
// greener; low completion is neutral/muted, never alarm-red.
const BAND_COLOR: Record<CompletionBand, string> = { high: "var(--sev-low)", mid: "var(--sev-medium)", low: "var(--text-dim)" };
const BAND_TONE: Record<CompletionBand, BadgeTone> = { high: "low", mid: "medium", low: "muted" };

export default async function Overview() {
  const programId = await programModel.primaryProgramId();
  if (!programId) {
    return <p style={{ color: "var(--text-dim)" }}>No program seeded yet. Run <code>npm run db:seed</code>.</p>;
  }
  const [kpis, priorityRows, inits, blocked, pending] = await Promise.all([
    programModel.overviewKpis(programId),
    programModel.openWorkByPriority(programId),
    programModel.initiativesWithProgress(programId),
    programModel.blockedIssues(programId),
    pendingProposals(),
  ]);
  const completePct = Math.round(kpis.completePct * 100);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Program health</h1>
        <span style={{ fontSize: 11, color: "var(--text-faint)" }}>Linear · Jira · GitHub · GitLab · Azure</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
        <KpiTile label="Complete" value={`${completePct}%`} sub={`${kpis.doneIssues}/${kpis.totalIssues} issues`} accent="var(--sev-low)" />
        <KpiTile label="Initiatives" value={kpis.initiatives} sub="tracked" />
        <KpiTile label="Open issues" value={kpis.openIssues} sub="not yet done" />
        <KpiTile label="Urgent / high" value={kpis.urgentHighOpen} sub="open, priority 1–2" accent="var(--sev-high)" />
        <KpiTile label="Awaiting you" value={kpis.pendingApprovals} sub="approvals" accent="var(--accent)" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 10 }}>
        <Panel title="Open work by priority" hint="initiative × priority"><PriorityHeatmap rows={priorityRows} /></Panel>
        <Panel title={`Blocked (${blocked.length})`}><BlockedList items={blocked} /></Panel>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 10 }}>
        <Panel title="Initiatives">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {inits.map((i) => (
              <div key={i.id} style={{ display: "grid", gridTemplateColumns: "1.3fr .8fr 1fr .7fr", gap: 8, alignItems: "center" }}>
                <span>{i.title}</span>
                <span style={{ color: "var(--text-dim)" }}>{i.owner ?? "—"}</span>
                <ProgressBar value={i.pct} color={BAND_COLOR[i.band]} />
                <span style={{ textAlign: "right" }}>
                  <Badge tone={BAND_TONE[i.band]}>{i.total > 0 ? `${i.done}/${i.total}` : "no issues"}</Badge>
                </span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title={`Awaiting approval (${pending.length})`}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {pending.length === 0 && <span style={{ color: "var(--text-dim)" }}>Inbox clear.</span>}
            {pending.map((p) => (
              <div key={p.id} style={{ background: "var(--bg)", borderRadius: "var(--radius-sm)", padding: 8, borderLeft: "3px solid var(--accent)" }}>
                <div>{p.summary}</div>
                {p.draft && <div style={{ fontSize: 11, color: "var(--text-faint)", margin: "2px 0 6px" }}>graded {p.draft.gradeScore} · ready</div>}
                <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                  <form action={approveProposal}><input type="hidden" name="id" value={p.id} />
                    <button style={{ background: "var(--accent-dim)", color: "var(--accent)", border: "none", padding: "3px 10px", borderRadius: 4, cursor: "pointer", font: "inherit" }}>Approve</button>
                  </form>
                  <form action={rejectProposal}><input type="hidden" name="id" value={p.id} />
                    <button style={{ background: "transparent", color: "var(--text-dim)", border: "none", padding: "3px 10px", cursor: "pointer", font: "inherit" }}>Reject</button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
