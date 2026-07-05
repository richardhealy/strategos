import type { DispatchPlanView } from "@/state/model/repository";

export function FlowBoard({ title, plan }: { title: string; plan: DispatchPlanView | null }) {
  if (!plan) {
    return <p style={{ color: "var(--text-dim)", fontSize: 13 }}>{title}: no dispatch plan yet.</p>;
  }
  const r = plan.readiness;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
        <span>{title} · {plan.waves.length} wave(s)</span>
        <span style={{ color: "var(--text-dim)" }}>
          {r.ready} ready · {r.needs_spec} needs-spec · {r.blocked} blocked · {plan.state.toLowerCase()}
        </span>
      </div>
      {plan.rationale && <p style={{ color: "var(--text-dim)", fontSize: 12, margin: 0 }}>{plan.rationale}</p>}
      {plan.waves.map((wave, i) => (
        <div key={i}>
          <div style={{ fontSize: 12, color: "var(--text-dim)" }}>Wave {i + 1}</div>
          <ul style={{ margin: 0, paddingLeft: 16, fontSize: 13 }}>
            {wave.map((t) => <li key={t.externalId}>{t.title}</li>)}
          </ul>
        </div>
      ))}
    </div>
  );
}
