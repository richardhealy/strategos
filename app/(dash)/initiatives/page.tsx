import { programModel } from "@/state/model/repository";
import { Panel, ProgressBar, Badge } from "@/components/ui/primitives";
export const dynamic = "force-dynamic";

export default async function Initiatives() {
  const pid = await programModel.primaryProgramId();
  const inits = pid ? await programModel.initiativesWithForecast(pid) : [];
  return (
    <Panel title="Initiatives">
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
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
  );
}
