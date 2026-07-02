const NAV: { key: string; label: string; href: string }[] = [
  { key: "overview", label: "Overview", href: "/" },
  { key: "initiatives", label: "Initiatives", href: "/initiatives" },
  { key: "risks", label: "Risks", href: "/risks" },
  { key: "sprints", label: "Sprints", href: "/sprints" },
  { key: "communications", label: "Communications", href: "/communications" },
  { key: "audit", label: "Audit log", href: "/audit" },
];

export function Sidebar({ active, programName }: { active: string; programName: string }) {
  return (
    <nav style={{ width: 176, background: "var(--surface-1)", borderRight: "1px solid var(--border)", padding: 16, display: "flex", flexDirection: "column", gap: 4, minHeight: "100vh" }}>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>strategos</div>
      {NAV.map((n) => {
        const on = n.key === active;
        return (
          <a key={n.key} href={n.href}
             style={{ padding: "7px 10px", borderRadius: "var(--radius-sm)", fontSize: 13,
                      fontWeight: on ? 600 : 400,
                      color: on ? "var(--accent)" : "var(--text-dim)",
                      background: on ? "var(--accent-dim)" : "transparent" }}>
            {n.label}
          </a>
        );
      })}
      <div style={{ marginTop: "auto", padding: 10, background: "var(--surface-2)", borderRadius: "var(--radius-sm)" }}>
        <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--text-faint)" }}>Program</div>
        <div style={{ fontWeight: 600 }}>{programName}</div>
      </div>
    </nav>
  );
}
