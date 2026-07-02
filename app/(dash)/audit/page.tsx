import { programModel } from "@/state/model/repository";
import { Panel } from "@/components/ui/primitives";
export const dynamic = "force-dynamic";

export default async function Audit() {
  const rows = await programModel.recentActivity(40);
  return (
    <Panel title="Audit log" hint={`${rows.length} recent actions`}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {rows.map((r) => (
          <div key={r.id} style={{ display: "grid", gridTemplateColumns: ".6fr .8fr 1fr", gap: 8, fontSize: 12 }}>
            <span style={{ color: "var(--accent)" }}>{r.actor}</span>
            <span>{r.action}</span>
            <span style={{ color: "var(--text-faint)", textAlign: "right" }}>{r.at.toISOString().replace("T", " ").slice(0, 19)}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}
