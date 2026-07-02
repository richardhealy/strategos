export function HealthDial({ score, band }: { score: number; band: string }) {
  const r = 34, c = 2 * Math.PI * r, filled = (Math.max(0, Math.min(100, score)) / 100) * c;
  const color = score >= 80 ? "var(--sev-low)" : score >= 50 ? "var(--sev-medium)" : "var(--sev-critical)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <svg width="84" height="84" viewBox="0 0 84 84">
        <circle cx="42" cy="42" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="8" />
        <circle cx="42" cy="42" r={r} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
                strokeDasharray={`${filled} ${c}`} transform="rotate(-90 42 42)" />
        <text x="42" y="47" textAnchor="middle" fontSize="20" fontWeight="700" fill="var(--text)">{score}</text>
      </svg>
      <div>
        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--text-faint)" }}>Program health</div>
        <div style={{ fontSize: 16, fontWeight: 600, color }}>{band}</div>
      </div>
    </div>
  );
}
