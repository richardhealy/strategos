import { programModel } from "@/state/model/repository";
import { pendingProposals } from "@/hitl/queue";
import { Panel, KpiTile, Badge, ProgressBar } from "@/components/ui/primitives";
import { RiskHeatmap } from "@/components/viz/RiskHeatmap";
import { VelocityBars } from "@/components/viz/VelocityBars";
import { HealthDial } from "@/components/viz/HealthDial";
import { approveProposal, rejectProposal } from "./actions";

export const dynamic = "force-dynamic";

export default async function Overview() {
  const programId = await programModel.primaryProgramId();
  if (!programId) {
    return <p style={{ color: "var(--text-dim)" }}>No program seeded yet. Run <code>npm run db:seed</code>.</p>;
  }
  const [summary, matrix, velocity, inits, pending] = await Promise.all([
    programModel.healthSummary(programId),
    programModel.riskMatrix(programId),
    programModel.velocityByTeam(programId),
    programModel.initiativesWithForecast(programId),
    pendingProposals(),
  ]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Program health</h1>
        <span style={{ fontSize: 11, color: "var(--text-faint)" }}>Linear · Jira · GitHub · GitLab · Azure</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
        <KpiTile label="Health" value={summary.score} sub={summary.band} accent="var(--sev-medium)" />
        <KpiTile label="On track" value={`${summary.onTrack}/${summary.total}`} sub="initiatives" />
        <KpiTile label="Open risks" value={summary.openRisks} sub={`${summary.criticalRisks} critical`} accent="var(--sev-critical)" />
        <KpiTile label="Predicted slips" value={summary.predictedSlips} sub="this quarter" />
        <KpiTile label="Awaiting you" value={summary.pendingApprovals} sub="approvals" accent="var(--accent)" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 10 }}>
        <Panel title="Risk heatmap" hint="initiative × type"><RiskHeatmap rows={matrix} /></Panel>
        <Panel title="Velocity by team"><VelocityBars teams={velocity} /></Panel>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 10 }}>
        <Panel title="Initiatives">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {inits.map((i) => (
              <div key={i.id} style={{ display: "grid", gridTemplateColumns: "1.3fr .8fr 1fr .7fr", gap: 8, alignItems: "center" }}>
                <span>{i.title}</span>
                <span style={{ color: "var(--text-dim)" }}>{i.owner ?? "—"}</span>
                <ProgressBar value={i.progress} color={`var(--sev-${i.tone})`} />
                <span style={{ textAlign: "right" }}><Badge tone={i.tone}>{i.forecast}</Badge></span>
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

      <Panel title="Program health detail">
        <HealthDial score={summary.score} band={summary.band} />
      </Panel>
    </div>
  );
}
