import type { BlockedIssue } from "@/state/model/repository";

// Open issues that have at least one unresolved blocker. Uses the sparse but
// real Linear blocked-by dependency data.
export function BlockedList({ items }: { items: BlockedIssue[] }) {
  if (items.length === 0) {
    return <span style={{ color: "var(--text-dim)" }}>Nothing blocked.</span>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((it) => (
        <div key={it.externalId} style={{ background: "var(--bg)", borderRadius: "var(--radius-sm)", padding: 8, borderLeft: "3px solid var(--sev-high)" }}>
          <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.title}</div>
          <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 2 }}>
            blocked by {it.blockers.map((b) => b.title).join(", ")}
          </div>
        </div>
      ))}
    </div>
  );
}
