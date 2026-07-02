import { db } from "@/db";
import { programModel } from "@/state/model/repository";
import { Panel, Badge } from "@/components/ui/primitives";
export const dynamic = "force-dynamic";

export default async function Risks() {
  const pid = await programModel.firstProgramId();
  const risks = pid ? await db.riskScore.findMany({
    where: { initiative: { programId: pid } },
    orderBy: { score: "desc" },
    include: { initiative: { select: { title: true } } },
  }) : [];
  const tone = (s: string) => s === "CRITICAL" ? "critical" : s === "HIGH" ? "high" : s === "MEDIUM" ? "medium" : "low";
  return (
    <Panel title="Risks" hint={`${risks.length} scored`}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {risks.map((r) => (
          <div key={r.id} style={{ display: "grid", gridTemplateColumns: ".8fr .5fr .5fr 2fr", gap: 8, alignItems: "center" }}>
            <span>{r.initiative.title}</span>
            <span style={{ color: "var(--text-dim)" }}>{r.kind}</span>
            <span><Badge tone={tone(r.severity)}>{r.severity}</Badge></span>
            <span style={{ color: "var(--text-faint)", fontSize: 12 }}>{r.explanation}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}
