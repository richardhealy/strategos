import type { CurrentSprint as CurrentSprintData } from "@/state/model/repository";

export function CurrentSprint({ sprint }: { sprint: CurrentSprintData | null }) {
  if (!sprint) {
    return <p style={{ color: "var(--text-dim)", fontSize: 13 }}>No sprint proposed yet. It runs Mondays, or on demand.</p>;
  }
  const window = `${sprint.startsAt.slice(0, 10)} → ${sprint.endsAt.slice(0, 10)}`;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
        <span>Sprint {sprint.index} · {sprint.count}/{sprint.capacityTarget} tickets · {window}</span>
        <span style={{ color: "var(--text-dim)" }}>{sprint.state.toLowerCase()}</span>
      </div>
      {sprint.rationale && <p style={{ color: "var(--text-dim)", fontSize: 12, margin: 0 }}>{sprint.rationale}</p>}
      <ul style={{ margin: 0, paddingLeft: 16, fontSize: 13 }}>
        {sprint.tickets.map((t) => (
          <li key={t.externalId}>
            {t.title}
            {t.priority ? <span style={{ color: "var(--text-dim)" }}> · P{t.priority}</span> : null}
            {t.assignee ? <span style={{ color: "var(--text-dim)" }}> · {t.assignee}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
