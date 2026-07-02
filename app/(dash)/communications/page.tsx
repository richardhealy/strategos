import { db } from "@/db";
import { Panel, Badge } from "@/components/ui/primitives";
export const dynamic = "force-dynamic";

export default async function Communications() {
  const drafts = await db.communicationDraft.findMany({
    orderBy: { createdAt: "desc" },
    include: { proposal: { select: { state: true } } },
  });
  return (
    <Panel title="Communications" hint={`${drafts.length} drafts`}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {drafts.map((d) => (
          <div key={d.id} style={{ background: "var(--bg)", borderRadius: "var(--radius-sm)", padding: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <strong>{d.subject ?? d.channel}</strong>
              <Badge tone="accent">{d.proposal.state}</Badge>
            </div>
            <div style={{ color: "var(--text-dim)", fontSize: 12, marginTop: 4 }}>{d.body}</div>
          </div>
        ))}
      </div>
    </Panel>
  );
}
