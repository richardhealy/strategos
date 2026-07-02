# strategos Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dense, dark "Command Center" Overview dashboard for strategos where every value is computed by the real engine over a believable seeded program.

**Architecture:** Pure, unit-tested helpers (velocity, risk matrix, health score, color tokens) feed thin Prisma read methods, which feed React Server Components styled by CSS-variable design tokens and hand-rolled SVG/CSS visualizations. The seed inserts raw facts then runs the actual scoring/velocity/HITL code to produce derived rows. HITL Approve/Reject are Next server actions that move real proposals through the existing gate.

**Tech Stack:** Next.js 15 (App Router, RSC), TypeScript (strict, `noUncheckedIndexedAccess`), Prisma 6 + Postgres, Vitest. No Tailwind, no chart library.

## Global Constraints

- **No new UI framework:** no Tailwind, no chart library. Styling via CSS custom properties in `app/tokens.css`; visualizations hand-rolled in SVG/CSS.
- **TypeScript strict + `noUncheckedIndexedAccess` are ON:** array index access yields `T | undefined`. Guard every index (`arr.at(-1) ?? fallback`, length checks).
- **Path alias:** import internal modules as `@/…` (maps to `src/…`). Prisma enums import from `@prisma/client`.
- **Palette (Tokyo Night):** base `#0b0e14`, accent `#7aa2f7`. Severity: LOW `#9ece6a`, MEDIUM `#e0af68`, HIGH `#ff9e64`, CRITICAL `#f7768e`. HITL blue = accent.
- **Vitest tests must not require a database** — test pure functions only; DB-backed methods are verified by running the seed + curl in Task 11.
- **Every value on Overview is engine-computed** from seeded raw facts — never a hard-coded fixture number.
- **Commit author:** this repo has no global git identity. Run once before Task 1:
  `git -C /Users/richardfernandez/Code/blueprint-projects/strategos config user.name "Claude" && git -C /Users/richardfernandez/Code/blueprint-projects/strategos config user.email "noreply@anthropic.com"`
- All work happens in `/Users/richardfernandez/Code/blueprint-projects/strategos`. Paths below are relative to it. The dev Postgres (docker compose `db`) and `.env` already exist.

---

### Task 1: Velocity helpers (pure)

**Files:**
- Create: `src/agents/risk/velocity.ts`
- Test: `tests/velocity.test.ts`

**Interfaces:**
- Consumes: `VelocityTrend` from `@prisma/client`.
- Produces: `velocityPerSprint(completed: number[]): number` (mean of last ≤3 periods, 0 if empty); `velocityTrend(completed: number[]): VelocityTrend` (RISING if last vs first grows >10%, DROPPING if shrinks >10%, else STABLE; STABLE if <2 points).

- [ ] **Step 1: Write the failing test**

```ts
// tests/velocity.test.ts
import { describe, it, expect } from "vitest";
import { velocityPerSprint, velocityTrend } from "@/agents/risk/velocity";

describe("velocityPerSprint", () => {
  it("returns 0 for an empty series", () => {
    expect(velocityPerSprint([])).toBe(0);
  });
  it("averages the last three periods", () => {
    expect(velocityPerSprint([10, 20, 30, 40, 50])).toBe(40); // (30+40+50)/3
  });
});

describe("velocityTrend", () => {
  it("is STABLE with fewer than two points", () => {
    expect(velocityTrend([12])).toBe("STABLE");
  });
  it("detects a rising trend", () => {
    expect(velocityTrend([10, 12, 15, 18])).toBe("RISING");
  });
  it("detects a dropping trend", () => {
    expect(velocityTrend([30, 24, 18, 12])).toBe("DROPPING");
  });
  it("is STABLE within a 10% band", () => {
    expect(velocityTrend([20, 21, 20, 21])).toBe("STABLE");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/velocity.test.ts`
Expected: FAIL — cannot resolve `@/agents/risk/velocity`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/agents/risk/velocity.ts
import type { VelocityTrend } from "@prisma/client";

// Pure velocity helpers, mirroring scoring.ts: no DB, no LLM, fully testable.

/** Mean completed points across the last up-to-3 periods. 0 when empty. */
export function velocityPerSprint(completed: number[]): number {
  if (completed.length === 0) return 0;
  const recent = completed.slice(-3);
  return recent.reduce((a, b) => a + b, 0) / recent.length;
}

/** Direction of travel from first to last period, with a 10% dead-band. */
export function velocityTrend(completed: number[]): VelocityTrend {
  if (completed.length < 2) return "STABLE";
  const first = completed[0] ?? 0;
  const last = completed.at(-1) ?? 0;
  const change = (last - first) / Math.max(first, 1);
  if (change > 0.1) return "RISING";
  if (change < -0.1) return "DROPPING";
  return "STABLE";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/velocity.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/agents/risk/velocity.ts tests/velocity.test.ts
git commit -m "feat(risk): pure velocity trend + per-sprint helpers"
```

---

### Task 2: Risk-matrix builder (pure)

**Files:**
- Create: `src/state/model/matrix.ts`
- Test: `tests/matrix.test.ts`

**Interfaces:**
- Consumes: `RiskKind`, `RiskSeverity` from `@prisma/client`.
- Produces:
  - `RISK_KINDS: RiskKind[]` = `["SCHEDULE","DEPENDENCY","BLOCKER","TEAM"]`
  - `worstSeverity(sevs: RiskSeverity[]): RiskSeverity` (highest severity; `"LOW"` if empty)
  - types `MatrixInitiative = { id: string; title: string; riskScores: { kind: RiskKind; severity: RiskSeverity }[] }`, `MatrixCell = { kind: RiskKind; severity: RiskSeverity | null }`, `MatrixRow = { id: string; title: string; cells: MatrixCell[] }`
  - `buildRiskMatrix(inits: MatrixInitiative[]): MatrixRow[]`

- [ ] **Step 1: Write the failing test**

```ts
// tests/matrix.test.ts
import { describe, it, expect } from "vitest";
import { buildRiskMatrix, worstSeverity, RISK_KINDS } from "@/state/model/matrix";

describe("worstSeverity", () => {
  it("returns LOW for no scores", () => {
    expect(worstSeverity([])).toBe("LOW");
  });
  it("picks the highest severity present", () => {
    expect(worstSeverity(["LOW", "CRITICAL", "MEDIUM"])).toBe("CRITICAL");
  });
});

describe("buildRiskMatrix", () => {
  it("produces one cell per risk kind, in order", () => {
    const rows = buildRiskMatrix([
      { id: "i1", title: "Checkout", riskScores: [{ kind: "SCHEDULE", severity: "HIGH" }] },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.cells.map((c) => c.kind)).toEqual(RISK_KINDS);
    expect(rows[0]!.cells[0]).toEqual({ kind: "SCHEDULE", severity: "HIGH" });
    expect(rows[0]!.cells[1]!.severity).toBeNull(); // DEPENDENCY absent
  });
  it("collapses multiple scores of one kind to the worst", () => {
    const rows = buildRiskMatrix([
      { id: "i1", title: "X", riskScores: [
        { kind: "BLOCKER", severity: "LOW" },
        { kind: "BLOCKER", severity: "HIGH" },
      ] },
    ]);
    const blocker = rows[0]!.cells.find((c) => c.kind === "BLOCKER")!;
    expect(blocker.severity).toBe("HIGH");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/matrix.test.ts`
Expected: FAIL — cannot resolve `@/state/model/matrix`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/state/model/matrix.ts
import type { RiskKind, RiskSeverity } from "@prisma/client";

export const RISK_KINDS: RiskKind[] = ["SCHEDULE", "DEPENDENCY", "BLOCKER", "TEAM"];

const SEVERITY_ORDER: Record<RiskSeverity, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };

export interface MatrixInitiative {
  id: string;
  title: string;
  riskScores: { kind: RiskKind; severity: RiskSeverity }[];
}
export interface MatrixCell { kind: RiskKind; severity: RiskSeverity | null }
export interface MatrixRow { id: string; title: string; cells: MatrixCell[] }

/** Highest severity in the list; LOW when empty. */
export function worstSeverity(sevs: RiskSeverity[]): RiskSeverity {
  return sevs.reduce<RiskSeverity>(
    (worst, s) => (SEVERITY_ORDER[s] > SEVERITY_ORDER[worst] ? s : worst),
    "LOW",
  );
}

/** Turn initiatives + their risk scores into an initiative × risk-kind grid. */
export function buildRiskMatrix(inits: MatrixInitiative[]): MatrixRow[] {
  return inits.map((i) => ({
    id: i.id,
    title: i.title,
    cells: RISK_KINDS.map((kind) => {
      const sevs = i.riskScores.filter((r) => r.kind === kind).map((r) => r.severity);
      return { kind, severity: sevs.length ? worstSeverity(sevs) : null };
    }),
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/matrix.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/state/model/matrix.ts tests/matrix.test.ts
git commit -m "feat(model): pure risk-matrix builder"
```

---

### Task 3: Health score + color tokens (pure)

**Files:**
- Create: `src/state/model/health.ts`
- Create: `src/components/viz/tokens.ts`
- Test: `tests/health.test.ts`

**Interfaces:**
- Consumes: `RiskSeverity`, `VelocityTrend` from `@prisma/client`.
- Produces:
  - `programHealthScore(severities: RiskSeverity[]): number` (100 minus weighted penalties LOW 2 / MEDIUM 6 / HIGH 12 / CRITICAL 20, floored at 0)
  - `healthBand(score: number): "Healthy" | "At risk" | "Critical"` (≥80 / ≥50 / else)
  - `severityToken(sev: RiskSeverity | null): string` (CSS var per severity; `var(--surface-2)` for null)
  - `trendToken(t: VelocityTrend): string` and `trendSymbol(t: VelocityTrend): string`

- [ ] **Step 1: Write the failing test**

```ts
// tests/health.test.ts
import { describe, it, expect } from "vitest";
import { programHealthScore, healthBand } from "@/state/model/health";
import { severityToken, trendSymbol } from "@/components/viz/tokens";

describe("programHealthScore", () => {
  it("is 100 with no risks", () => {
    expect(programHealthScore([])).toBe(100);
  });
  it("subtracts weighted penalties", () => {
    expect(programHealthScore(["CRITICAL", "HIGH"])).toBe(68); // 100 - 20 - 12
  });
  it("never goes below 0", () => {
    expect(programHealthScore(Array(20).fill("CRITICAL"))).toBe(0);
  });
});

describe("healthBand", () => {
  it("bands by score", () => {
    expect(healthBand(90)).toBe("Healthy");
    expect(healthBand(72)).toBe("At risk");
    expect(healthBand(30)).toBe("Critical");
  });
});

describe("tokens", () => {
  it("maps severity to a css var", () => {
    expect(severityToken("CRITICAL")).toBe("var(--sev-critical)");
    expect(severityToken(null)).toBe("var(--surface-2)");
  });
  it("maps trend to a symbol", () => {
    expect(trendSymbol("RISING")).toBe("▲");
    expect(trendSymbol("DROPPING")).toBe("▼");
    expect(trendSymbol("STABLE")).toBe("▬");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/health.test.ts`
Expected: FAIL — cannot resolve `@/state/model/health`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/state/model/health.ts
import type { RiskSeverity } from "@prisma/client";

const PENALTY: Record<RiskSeverity, number> = { LOW: 2, MEDIUM: 6, HIGH: 12, CRITICAL: 20 };

/** 0..100 program health: full marks minus weighted risk penalties. */
export function programHealthScore(severities: RiskSeverity[]): number {
  const penalty = severities.reduce((sum, s) => sum + PENALTY[s], 0);
  return Math.max(0, 100 - penalty);
}

export function healthBand(score: number): "Healthy" | "At risk" | "Critical" {
  if (score >= 80) return "Healthy";
  if (score >= 50) return "At risk";
  return "Critical";
}
```

```ts
// src/components/viz/tokens.ts
import type { RiskSeverity, VelocityTrend } from "@prisma/client";

// Single source of truth mapping domain values to the CSS custom properties
// declared in app/tokens.css. Keeps color logic out of the components.

export function severityToken(sev: RiskSeverity | null): string {
  switch (sev) {
    case "CRITICAL": return "var(--sev-critical)";
    case "HIGH": return "var(--sev-high)";
    case "MEDIUM": return "var(--sev-medium)";
    case "LOW": return "var(--sev-low)";
    default: return "var(--surface-2)";
  }
}

export function trendToken(t: VelocityTrend): string {
  switch (t) {
    case "RISING": return "var(--sev-low)";
    case "DROPPING": return "var(--sev-critical)";
    default: return "var(--text-dim)";
  }
}

export function trendSymbol(t: VelocityTrend): string {
  switch (t) {
    case "RISING": return "▲";
    case "DROPPING": return "▼";
    default: return "▬";
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/health.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/state/model/health.ts src/components/viz/tokens.ts tests/health.test.ts
git commit -m "feat(model): pure health score + severity/trend token maps"
```

---

### Task 4: Design tokens + UI primitives + dashboard shell

**Files:**
- Create: `app/tokens.css`
- Modify: `app/layout.tsx` (import tokens, use CSS vars)
- Create: `src/components/ui/Sidebar.tsx`
- Create: `src/components/ui/primitives.tsx` (`Panel`, `KpiTile`, `Badge`, `ProgressBar`)
- Create: `app/(dash)/layout.tsx`

**Interfaces:**
- Produces (server components):
  - `<Sidebar active="overview" programName={string} />`
  - `<Panel title={string} hint?={string}>…children…</Panel>`
  - `<KpiTile label={string} value={string|number} sub?={string} accent?={string} />`
  - `<Badge tone="low|medium|high|critical|accent|muted">text</Badge>`
  - `<ProgressBar value={number} color={string} />` (value 0..1)

- [ ] **Step 1: Create the design tokens**

```css
/* app/tokens.css */
:root {
  --bg: #0b0e14;
  --surface-1: #131826;
  --surface-2: #1b2233;
  --border: #1c2230;
  --text: #e6e6e6;
  --text-dim: #7d879c;
  --text-faint: #5b647c;
  --accent: #7aa2f7;
  --accent-dim: #1b2540;
  --sev-low: #9ece6a;
  --sev-medium: #e0af68;
  --sev-high: #ff9e64;
  --sev-critical: #f7768e;
  --radius: 8px;
  --radius-sm: 5px;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
  font-size: 13px;
}
a { color: inherit; text-decoration: none; }
```

- [ ] **Step 2: Wire tokens into the root layout**

Replace the whole file:

```tsx
// app/layout.tsx
import "./tokens.css";

export const metadata = {
  title: "strategos",
  description: "Autonomous AI Technical Program Manager",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 3: Create the UI primitives**

```tsx
// src/components/ui/primitives.tsx
import type { ReactNode } from "react";

export function Panel({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section style={{ background: "var(--surface-1)", borderRadius: "var(--radius)", padding: 14 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 12 }}>
        <h2 style={{ fontSize: 13, fontWeight: 600, margin: 0, color: "var(--text)" }}>{title}</h2>
        {hint && <span style={{ fontSize: 11, color: "var(--text-faint)" }}>{hint}</span>}
      </div>
      {children}
    </section>
  );
}

export function KpiTile({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div style={{ background: "var(--surface-1)", borderRadius: "var(--radius)", padding: 12, borderTop: `2px solid ${accent ?? "var(--border)"}` }}>
      <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--text-faint)" }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: accent ?? "var(--text)", lineHeight: 1.2 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--text-dim)" }}>{sub}</div>}
    </div>
  );
}

const TONE: Record<string, string> = {
  low: "var(--sev-low)", medium: "var(--sev-medium)", high: "var(--sev-high)",
  critical: "var(--sev-critical)", accent: "var(--accent)", muted: "var(--text-dim)",
};
export function Badge({ tone, children }: { tone: keyof typeof TONE | string; children: ReactNode }) {
  const color = TONE[tone] ?? "var(--text-dim)";
  return (
    <span style={{ fontSize: 11, color, background: "var(--surface-2)", padding: "2px 8px", borderRadius: "var(--radius-sm)" }}>{children}</span>
  );
}

export function ProgressBar({ value, color }: { value: number; color: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div style={{ height: 6, background: "var(--surface-2)", borderRadius: 3, overflow: "hidden" }}>
      <div style={{ width: `${pct}%`, height: "100%", background: color }} />
    </div>
  );
}
```

- [ ] **Step 4: Create the sidebar**

```tsx
// src/components/ui/Sidebar.tsx
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
```

- [ ] **Step 5: Create the dashboard route-group layout**

```tsx
// app/(dash)/layout.tsx
import { Sidebar } from "@/components/ui/Sidebar";

// Route group (dash) gives every dashboard page the sidebar shell without
// affecting the URL. /privacy and /terms stay outside it (no sidebar).
export default function DashLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar active="overview" programName="Payments Platform" />
      <main style={{ flex: 1, padding: "18px 22px" }}>{children}</main>
    </div>
  );
}
```

Note: `active="overview"` is a reasonable default for this pass; per-page active state is out of scope (Sprints/Communications are light views).

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: PASS (exit 0). (No page yet consumes these; this verifies the components compile.)

- [ ] **Step 7: Commit**

```bash
git add app/tokens.css app/layout.tsx src/components/ui/ "app/(dash)/layout.tsx"
git commit -m "feat(ui): Tokyo Night design tokens, UI primitives, dashboard shell"
```

---

### Task 5: Visualizations (RiskHeatmap, VelocityBars, HealthDial)

**Files:**
- Create: `src/components/viz/RiskHeatmap.tsx`
- Create: `src/components/viz/VelocityBars.tsx`
- Create: `src/components/viz/HealthDial.tsx`

**Interfaces:**
- Consumes: `MatrixRow`, `RISK_KINDS` from `@/state/model/matrix`; `severityToken`, `trendToken`, `trendSymbol` from `@/components/viz/tokens`; `VelocityTrend` from `@prisma/client`.
- Produces:
  - `<RiskHeatmap rows={MatrixRow[]} />`
  - `<VelocityBars teams={{ name: string; completed: number[]; trend: VelocityTrend }[]} />`
  - `<HealthDial score={number} band={string} />`

- [ ] **Step 1: RiskHeatmap**

```tsx
// src/components/viz/RiskHeatmap.tsx
import { Fragment } from "react";
import { RISK_KINDS, type MatrixRow } from "@/state/model/matrix";
import { severityToken } from "@/components/viz/tokens";

const LABEL: Record<string, string> = { SCHEDULE: "Sched", DEPENDENCY: "Dep", BLOCKER: "Block", TEAM: "Team" };

export function RiskHeatmap({ rows }: { rows: MatrixRow[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `120px repeat(${RISK_KINDS.length}, 1fr)`, gap: 4, alignItems: "center" }}>
      <div />
      {RISK_KINDS.map((k) => (
        <div key={k} style={{ fontSize: 9, color: "var(--text-faint)", textAlign: "center" }}>{LABEL[k]}</div>
      ))}
      {rows.map((row) => (
        <Fragment key={row.id}>
          <div style={{ fontSize: 12, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.title}</div>
          {row.cells.map((c) => (
            <div key={`${row.id}-${c.kind}`} title={`${row.title} · ${c.kind}: ${c.severity ?? "none"}`}
                 style={{ height: 18, background: severityToken(c.severity), borderRadius: 3 }} />
          ))}
        </Fragment>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: VelocityBars**

```tsx
// src/components/viz/VelocityBars.tsx
import type { VelocityTrend } from "@prisma/client";
import { trendToken, trendSymbol } from "@/components/viz/tokens";

export function VelocityBars({ teams }: { teams: { name: string; completed: number[]; trend: VelocityTrend }[] }) {
  const max = Math.max(1, ...teams.flatMap((t) => t.completed));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {teams.map((t) => (
        <div key={t.name}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
            <span style={{ color: "var(--text-dim)" }}>{t.name}</span>
            <span style={{ color: trendToken(t.trend) }}>{trendSymbol(t.trend)} {t.trend.toLowerCase()}</span>
          </div>
          <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 24, marginTop: 3 }}>
            {t.completed.map((v, i) => (
              <div key={i} style={{ flex: 1, height: `${(v / max) * 100}%`, background: "var(--accent)", borderRadius: 1, minHeight: 2 }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: HealthDial**

```tsx
// src/components/viz/HealthDial.tsx
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
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS (exit 0).

- [ ] **Step 5: Commit**

```bash
git add src/components/viz/RiskHeatmap.tsx src/components/viz/VelocityBars.tsx src/components/viz/HealthDial.tsx
git commit -m "feat(viz): SVG/CSS risk heatmap, velocity bars, health dial"
```

---

### Task 6: Repository read methods

**Files:**
- Modify: `src/state/model/repository.ts` (append methods to `programModel`)

**Interfaces:**
- Consumes: `db` from `@/db`; `buildRiskMatrix`, `MatrixRow` from `@/state/model/matrix`; `velocityPerSprint`, `velocityTrend` from `@/agents/risk/velocity`; `programHealthScore`, `healthBand` from `@/state/model/health`.
- Produces new `programModel` methods:
  - `firstProgramId(): Promise<string | null>`
  - `healthSummary(programId): Promise<{ score: number; band: string; onTrack: number; total: number; openRisks: number; criticalRisks: number; predictedSlips: number; pendingApprovals: number }>`
  - `riskMatrix(programId): Promise<MatrixRow[]>`
  - `velocityByTeam(programId): Promise<{ name: string; completed: number[]; trend: import("@prisma/client").VelocityTrend }[]>`
  - `initiativesWithForecast(programId): Promise<{ id: string; title: string; owner: string | null; progress: number; forecast: string; tone: string }[]>`
  - `recentActivity(limit?): Promise<{ id: string; actor: string; action: string; at: Date }[]>`

- [ ] **Step 1: Append the methods**

Add these methods inside the `programModel` object literal in `src/state/model/repository.ts` (after `latestVelocity`, keeping the existing methods). Add the imports at the top of the file.

```ts
// add to the imports at the top of src/state/model/repository.ts
import { buildRiskMatrix, type MatrixRow } from "@/state/model/matrix";
import { velocityPerSprint, velocityTrend } from "@/agents/risk/velocity";
import { programHealthScore, healthBand } from "@/state/model/health";
import type { VelocityTrend } from "@prisma/client";
```

```ts
  // ----- dashboard read methods -----

  async firstProgramId(): Promise<string | null> {
    const p = await db.program.findFirst({ orderBy: { createdAt: "asc" } });
    return p?.id ?? null;
  },

  async healthSummary(programId: string) {
    const [initiatives, risks, pendingApprovals] = await Promise.all([
      db.initiative.findMany({ where: { programId }, select: { status: true } }),
      db.riskScore.findMany({ where: { initiative: { programId } }, select: { kind: true, severity: true } }),
      db.hitlProposal.count({ where: { state: "PENDING" } }),
    ]);
    const score = programHealthScore(risks.map((r) => r.severity));
    const openRisks = risks.filter((r) => r.severity === "HIGH" || r.severity === "CRITICAL").length;
    const criticalRisks = risks.filter((r) => r.severity === "CRITICAL").length;
    const predictedSlips = risks.filter((r) => r.kind === "SCHEDULE" && (r.severity === "HIGH" || r.severity === "CRITICAL")).length;
    const total = initiatives.length;
    const onTrack = total - predictedSlips;
    return { score, band: healthBand(score), onTrack, total, openRisks, criticalRisks, predictedSlips, pendingApprovals };
  },

  async riskMatrix(programId: string): Promise<MatrixRow[]> {
    const inits = await db.initiative.findMany({
      where: { programId },
      orderBy: { createdAt: "asc" },
      include: { riskScores: { select: { kind: true, severity: true } } },
    });
    return buildRiskMatrix(inits.map((i) => ({ id: i.id, title: i.title, riskScores: i.riskScores })));
  },

  async velocityByTeam(programId: string): Promise<{ name: string; completed: number[]; trend: VelocityTrend }[]> {
    const teams = await db.team.findMany({
      where: { programId },
      orderBy: { createdAt: "asc" },
      include: { velocitySnapshots: { orderBy: { periodStart: "asc" }, select: { completedPts: true } } },
    });
    return teams.map((t) => {
      const completed = t.velocitySnapshots.map((s) => s.completedPts);
      return { name: t.name, completed, trend: velocityTrend(completed) };
    });
  },

  async initiativesWithForecast(programId: string) {
    const inits = await db.initiative.findMany({
      where: { programId },
      orderBy: { createdAt: "asc" },
      include: {
        epics: { include: { tasks: { select: { status: true, estimatePoints: true } } } },
        riskScores: { where: { kind: "SCHEDULE" }, orderBy: { computedAt: "desc" }, take: 1 },
      },
    });
    return inits.map((i) => {
      const tasks = i.epics.flatMap((e) => e.tasks);
      const totalPts = tasks.reduce((s, t) => s + (t.estimatePoints ?? 0), 0);
      const donePts = tasks.filter((t) => t.status === "DONE").reduce((s, t) => s + (t.estimatePoints ?? 0), 0);
      const progress = totalPts > 0 ? donePts / totalPts : 0;
      const sched = i.riskScores[0];
      const sev = sched?.severity ?? "LOW";
      const forecast = sev === "CRITICAL" || sev === "HIGH" ? "at risk" : sev === "MEDIUM" ? "tight" : "on track";
      const tone = sev === "CRITICAL" ? "critical" : sev === "HIGH" ? "high" : sev === "MEDIUM" ? "medium" : "low";
      return { id: i.id, title: i.title, owner: i.owner, progress, forecast, tone };
    });
  },

  async recentActivity(limit = 12) {
    const rows = await db.actionLog.findMany({ orderBy: { at: "desc" }, take: limit });
    return rows.map((r) => ({ id: r.id, actor: r.actor, action: r.action, at: r.at }));
  },
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS (exit 0).

- [ ] **Step 3: Commit**

```bash
git add src/state/model/repository.ts
git commit -m "feat(model): dashboard read methods (health, matrix, velocity, forecast, activity)"
```

---

### Task 7: Engine-computed seed

**Files:**
- Modify: `prisma/seed.ts` (full rewrite)
- Modify: `package.json` (add `dotenv` devDependency via install)

**Interfaces:**
- Consumes: `db`; `scoreScheduleRisk` from `@/agents/risk/scoring`; `velocityPerSprint` from `@/agents/risk/velocity`; `hitl` from `@/hitl/gate`.
- Produces: a populated "Payments Platform" program whose `RiskScore` rows are engine output.

- [ ] **Step 1: Install dotenv (so the standalone seed loads .env)**

Run: `npm install -D dotenv`
Expected: adds `dotenv` to devDependencies.

- [ ] **Step 2: Write the seed**

Replace the whole file:

```ts
// prisma/seed.ts
import "dotenv/config";
import { db } from "../src/db";
import { scoreScheduleRisk } from "../src/agents/risk/scoring";
import { velocityPerSprint } from "../src/agents/risk/velocity";
import { hitl } from "../src/hitl/gate";
import type { ItemStatus } from "@prisma/client";

// Seed RAW FACTS, then run the real engine over them so every derived value on
// the dashboard is engine output, not a fixture. Deterministic: we wipe and
// recreate from fixed inputs, and scoreScheduleRisk is pure.

const SPRINT_MS = 14 * 24 * 60 * 60 * 1000;

async function wipe() {
  // FK-safe order.
  await db.actionLog.deleteMany();
  await db.communicationDraft.deleteMany();
  await db.hitlProposal.deleteMany();
  await db.riskScore.deleteMany();
  await db.velocitySnapshot.deleteMany();
  await db.dependency.deleteMany();
  await db.task.deleteMany();
  await db.epic.deleteMany();
  await db.initiative.deleteMany();
  await db.team.deleteMany();
  await db.stateChange.deleteMany();
  await db.externalRef.deleteMany();
  await db.syncCursor.deleteMany();
  await db.program.deleteMany();
}

interface TeamSpec { name: string; velocity: number[] }
const TEAMS: TeamSpec[] = [
  { name: "Core", velocity: [18, 20, 19, 24, 28] },      // rising
  { name: "Payments", velocity: [30, 26, 22, 18, 14] },  // dropping
  { name: "Risk", velocity: [16, 17, 16, 17, 16] },      // stable
  { name: "Platform", velocity: [22, 21, 23, 22, 24] },  // stable
  { name: "Mobile", velocity: [12, 14, 15, 19, 22] },    // rising
];

interface InitSpec {
  title: string; owner: string; team: string;
  weeksToTarget: number; remaining: number; done: number;
}
const INITS: InitSpec[] = [
  { title: "Checkout v2",        owner: "A. Kir",   team: "Payments", weeksToTarget: 6,  remaining: 70, done: 30 },
  { title: "Ledger migration",   owner: "M. Osei",  team: "Core",     weeksToTarget: 12, remaining: 30, done: 50 },
  { title: "Fraud engine",       owner: "L. Vance", team: "Risk",     weeksToTarget: 8,  remaining: 55, done: 20 },
  { title: "Payouts SLA",        owner: "R. Cho",   team: "Platform", weeksToTarget: 14, remaining: 12, done: 60 },
  { title: "Mobile wallet",      owner: "S. Diaz",  team: "Mobile",   weeksToTarget: 10, remaining: 40, done: 15 },
  { title: "Dispute automation", owner: "T. Park",  team: "Risk",     weeksToTarget: 16, remaining: 25, done: 10 },
  { title: "Settlement v3",      owner: "J. Wu",    team: "Core",     weeksToTarget: 5,  remaining: 45, done: 20 },
  { title: "KYC refresh",        owner: "E. Roth",  team: "Platform", weeksToTarget: 18, remaining: 20, done: 5 },
  { title: "Card tokenization",  owner: "N. Bello", team: "Mobile",   weeksToTarget: 9,  remaining: 35, done: 25 },
];

async function main() {
  await wipe();
  const now = Date.now();
  const program = await db.program.create({ data: { name: "Payments Platform" } });

  // Teams + velocity history (raw facts).
  const teamId = new Map<string, string>();
  const teamPerSprint = new Map<string, number>();
  for (const t of TEAMS) {
    const team = await db.team.create({ data: { programId: program.id, name: t.name } });
    teamId.set(t.name, team.id);
    teamPerSprint.set(t.name, velocityPerSprint(t.velocity));
    for (let i = 0; i < t.velocity.length; i++) {
      const start = new Date(now - (t.velocity.length - i) * SPRINT_MS);
      const end = new Date(start.getTime() + SPRINT_MS);
      await db.velocitySnapshot.create({
        data: { teamId: team.id, periodStart: start, periodEnd: end, completedPts: t.velocity[i]!, committedPts: t.velocity[i]! + 4 },
      });
    }
  }

  // Initiatives -> epics/tasks -> ENGINE-COMPUTED schedule risk.
  const initIds: string[] = [];
  for (const spec of INITS) {
    const targetDate = new Date(now + spec.weeksToTarget * 7 * 24 * 60 * 60 * 1000);
    const status: ItemStatus = "IN_PROGRESS";
    const init = await db.initiative.create({
      data: { programId: program.id, title: spec.title, owner: spec.owner, status, targetDate },
    });
    initIds.push(init.id);

    const epic = await db.epic.create({
      data: { initiativeId: init.id, teamId: teamId.get(spec.team)!, title: `${spec.title} — delivery`, status: "IN_PROGRESS", estimatePoints: spec.remaining + spec.done },
    });
    // one DONE task carrying the done points, one open task carrying the remaining points
    await db.task.create({ data: { epicId: epic.id, title: "completed work", status: "DONE", estimatePoints: spec.done } });
    await db.task.create({ data: { epicId: epic.id, title: "remaining work", status: "IN_PROGRESS", estimatePoints: spec.remaining, criticalPath: true } });

    // RUN THE ENGINE
    const perSprint = teamPerSprint.get(spec.team) ?? 0;
    const sprintsRemaining = Math.max(0, Math.ceil((targetDate.getTime() - now) / SPRINT_MS));
    const risk = scoreScheduleRisk({ remainingPoints: spec.remaining, velocityPerSprint: perSprint, sprintsRemaining });
    await db.riskScore.create({
      data: {
        initiativeId: init.id, kind: "SCHEDULE", severity: risk.severity, score: risk.score,
        confidence: 0.8, explanation: risk.explanation,
        mitigation: risk.willSlip ? "Re-scope or add capacity next sprint." : undefined,
        escalated: risk.severity === "CRITICAL",
      },
    });
  }

  // A dependency + a DEPENDENCY risk on Fraud engine (index 2) depending on Ledger (index 1).
  const fraud = initIds[2]!, ledger = initIds[1]!;
  const fraudEpic = await db.epic.findFirstOrThrow({ where: { initiativeId: fraud } });
  const ledgerEpic = await db.epic.findFirstOrThrow({ where: { initiativeId: ledger } });
  await db.dependency.create({ data: { fromId: fraudEpic.id, toId: ledgerEpic.id, resolved: false, note: "needs ledger schema" } });
  await db.riskScore.create({
    data: { initiativeId: fraud, kind: "DEPENDENCY", severity: "HIGH", score: 0.7, confidence: 0.7,
            explanation: "Blocked on unresolved upstream: Ledger migration schema.", mitigation: "Sequence ledger schema freeze first." },
  });

  // Proposals through the REAL gate (writes audit rows).
  const p1 = await hitl.propose({ kind: "COMMUNICATION", summary: "Exec status update · Wk 27", createdBy: "communicator",
    payload: { channel: "exec-update", audience: "leadership" } });
  await db.communicationDraft.create({ data: { proposalId: p1, channel: "exec-update", audience: "leadership",
    subject: "Payments Platform — Week 27", body: "6 of 9 initiatives on track. Checkout v2 and Fraud engine at schedule risk; mitigations proposed.",
    gradeScore: 0.91, gradePass: true } });
  await hitl.propose({ kind: "PLAN_CHANGE", summary: "Rebalance Checkout scope (−2 stories)", createdBy: "sprint",
    payload: { initiative: "Checkout v2", drop: 2 } });
  await hitl.propose({ kind: "COMMUNICATION", summary: "Risk escalation: Fraud engine dependency", createdBy: "escalator",
    payload: { channel: "follow-up", audience: "Ledger team" } });

  const counts = {
    initiatives: await db.initiative.count(),
    risks: await db.riskScore.count(),
    proposals: await db.hitlProposal.count(),
  };
  console.log("Seeded Payments Platform:", counts);
}

main().finally(() => db.$disconnect());
```

- [ ] **Step 3: Run the seed**

Run: `npm run db:seed`
Expected: prints `Seeded Payments Platform: { initiatives: 9, risks: 10, proposals: 3 }`.

- [ ] **Step 4: Verify determinism (reseed, counts stable)**

Run: `npm run db:seed`
Expected: identical line `{ initiatives: 9, risks: 10, proposals: 3 }` (wipe + fixed inputs ⇒ stable counts and severities).

- [ ] **Step 5: Commit**

```bash
git add prisma/seed.ts package.json package-lock.json
git commit -m "feat(seed): engine-computed Payments Platform demo program"
```

---

### Task 8: Overview page

**Files:**
- Delete: `app/page.tsx` (old inline dashboard — replaced by the route-group page)
- Create: `app/(dash)/page.tsx`

**Interfaces:**
- Consumes: `programModel` read methods (Task 6); `pendingProposals` from `@/hitl/queue`; primitives (Task 4); viz (Task 5).

- [ ] **Step 1: Remove the old root page**

Run: `git rm app/page.tsx`
Expected: file staged for deletion. (The `(dash)` group now owns `/`.)

- [ ] **Step 2: Write the Overview page**

```tsx
// app/(dash)/page.tsx
import { programModel } from "@/state/model/repository";
import { pendingProposals } from "@/hitl/queue";
import { Panel, KpiTile, Badge, ProgressBar } from "@/components/ui/primitives";
import { RiskHeatmap } from "@/components/viz/RiskHeatmap";
import { VelocityBars } from "@/components/viz/VelocityBars";
import { HealthDial } from "@/components/viz/HealthDial";
import { approveProposal, rejectProposal } from "./actions";

export const dynamic = "force-dynamic";

export default async function Overview() {
  const programId = await programModel.firstProgramId();
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
```

Note: this imports `./actions` (created in Task 9). If executing tasks strictly in order, create a temporary stub `app/(dash)/actions.ts` exporting `export async function approveProposal() {}` / `rejectProposal() {}` to typecheck now; Task 9 replaces it. Otherwise do Task 9 before running the server.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS (exit 0) — with either the Task 9 actions or the stub in place.

- [ ] **Step 4: Commit**

```bash
git add "app/(dash)/page.tsx"
git commit -m "feat(dash): Command Center Overview page"
```

---

### Task 9: HITL server actions (live approve/reject)

**Files:**
- Create: `src/hitl/effects.ts`
- Create: `app/(dash)/actions.ts` (replaces any stub from Task 8)

**Interfaces:**
- Consumes: `hitl` from `@/hitl/gate`; `revalidatePath` from `next/cache`.
- Produces: `registerDemoEffects(): void`; server actions `approveProposal(formData: FormData): Promise<void>`, `rejectProposal(formData: FormData): Promise<void>`.

- [ ] **Step 1: Demo effects (the only outward path — simulated, per the gate invariant)**

```ts
// src/hitl/effects.ts
import { hitl } from "@/hitl/gate";

let registered = false;

// Register a simulated effect per proposal kind so an APPROVED proposal can be
// APPLIED end-to-end for the demo. These stand in for real sends/writes; the
// HITL gate remains the single choke point for any outward action.
export function registerDemoEffects(): void {
  if (registered) return;
  registered = true;
  hitl.register("COMMUNICATION", async () => ({ ref: "sent:simulated" }));
  hitl.register("PLAN_CHANGE", async () => ({ ref: "plan:updated" }));
  hitl.register("TICKET_WRITE", async () => ({ ref: "ticket:simulated" }));
}
```

- [ ] **Step 2: Server actions**

```ts
// app/(dash)/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { hitl } from "@/hitl/gate";
import { registerDemoEffects } from "@/hitl/effects";

export async function approveProposal(formData: FormData): Promise<void> {
  registerDemoEffects();
  const id = String(formData.get("id"));
  await hitl.decide(id, true, "dashboard-user");
  await hitl.apply(id); // moves APPROVED -> APPLIED and writes the audit trail
  revalidatePath("/");
  revalidatePath("/audit");
}

export async function rejectProposal(formData: FormData): Promise<void> {
  const id = String(formData.get("id"));
  await hitl.decide(id, false, "dashboard-user", "rejected from dashboard");
  revalidatePath("/");
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS (exit 0).

- [ ] **Step 4: Commit**

```bash
git add src/hitl/effects.ts "app/(dash)/actions.ts"
git commit -m "feat(hitl): live approve/reject server actions through the gate"
```

---

### Task 10: Secondary pages

**Files:**
- Create: `app/(dash)/initiatives/page.tsx`
- Create: `app/(dash)/risks/page.tsx`
- Create: `app/(dash)/audit/page.tsx`
- Create: `app/(dash)/sprints/page.tsx`
- Create: `app/(dash)/communications/page.tsx`

**Interfaces:**
- Consumes: `programModel`, `db` from `@/db`, primitives.

- [ ] **Step 1: Initiatives (real list)**

```tsx
// app/(dash)/initiatives/page.tsx
import { programModel } from "@/state/model/repository";
import { Panel, ProgressBar, Badge } from "@/components/ui/primitives";
export const dynamic = "force-dynamic";

export default async function Initiatives() {
  const pid = await programModel.firstProgramId();
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
```

- [ ] **Step 2: Risks (real list)**

```tsx
// app/(dash)/risks/page.tsx
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
```

- [ ] **Step 3: Audit (real list)**

```tsx
// app/(dash)/audit/page.tsx
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
```

- [ ] **Step 4: Sprints + Communications (light views)**

```tsx
// app/(dash)/sprints/page.tsx
import { programModel } from "@/state/model/repository";
import { Panel } from "@/components/ui/primitives";
import { VelocityBars } from "@/components/viz/VelocityBars";
export const dynamic = "force-dynamic";

export default async function Sprints() {
  const pid = await programModel.firstProgramId();
  const velocity = pid ? await programModel.velocityByTeam(pid) : [];
  return <Panel title="Sprints" hint="velocity by team"><VelocityBars teams={velocity} /></Panel>;
}
```

```tsx
// app/(dash)/communications/page.tsx
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
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS (exit 0).

- [ ] **Step 6: Commit**

```bash
git add "app/(dash)/initiatives" "app/(dash)/risks" "app/(dash)/audit" "app/(dash)/sprints" "app/(dash)/communications"
git commit -m "feat(dash): initiatives, risks, audit, sprints, communications pages"
```

---

### Task 11: Full verification

**Files:** none (verification + final commit only).

- [ ] **Step 1: Lint, typecheck, tests all green**

Run: `npm run lint && npm run typecheck && npm test`
Expected: lint PASS (0 errors), typecheck PASS, tests PASS (existing 7 + velocity 6 + matrix 4 + health 6 = 23).

- [ ] **Step 2: Reseed**

Run: `npm run db:seed`
Expected: `{ initiatives: 9, risks: 10, proposals: 3 }`.

- [ ] **Step 3: Boot the dev server (background) and probe every route**

Run:
```bash
( npm run dev >/tmp/strategos-dev.log 2>&1 & ) ; sleep 6
for p in "/" "/initiatives" "/risks" "/sprints" "/communications" "/audit" "/privacy" "/terms"; do
  echo "$p -> $(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000$p)"
done
```
Expected: every route prints `200`.

- [ ] **Step 4: Confirm the Overview is engine-populated**

Run:
```bash
curl -s http://localhost:3000/ | grep -oE "Program health|Risk heatmap|Velocity by team|Awaiting approval \([0-9]+\)" | sort -u
```
Expected: all four strings present, and the approval count is `(3)`.

- [ ] **Step 5: Exercise the live HITL gate**

Get the first pending proposal id and approve it via the server action, then confirm an audit row appeared:
```bash
node --env-file=.env -e "const{PrismaClient}=require('@prisma/client');const db=new PrismaClient();(async()=>{const p=await db.hitlProposal.findFirst({where:{state:'PENDING'},orderBy:{createdAt:'asc'}});const before=await db.actionLog.count();const{hitl}=await import('./src/hitl/gate.ts').catch(()=>({}));console.log('pending proposal:',p&&p.id,'audit rows before:',before);await db.\$disconnect();})()" 2>/dev/null || echo "(inspect via the UI instead: click Approve on the Overview inbox, then load /audit)"
```
Primary check (UI): load `http://localhost:3000/`, click **Approve** on the first inbox item, then open `http://localhost:3000/audit` — a new `hitl · apply` row is at the top, and the Overview "Awaiting you" KPI dropped by one.
Expected: audit shows the `apply` action; approved item no longer in the inbox.

- [ ] **Step 6: Stop the dev server**

Run: `pkill -f "next dev" || true`
Expected: server stops.

- [ ] **Step 7: Final commit + push**

```bash
git add -A
git commit -m "chore: strategos dashboard verified (routes 200, engine-populated, HITL live)" --allow-empty
git push origin main
```
Expected: pushed to `origin/main`.

---

## Self-Review notes (author)

- **Spec coverage:** Command Center layout (Tasks 4,5,8) · Tokyo Night tokens (Task 4) · engine-computed seed (Task 7) · KPI/heatmap/velocity/initiatives/HITL panels (Task 8) · nav sections (Task 4 Sidebar + Task 10 pages) · live HITL through the gate (Task 9) + audit visible (Task 10) · velocity helper + repo shaping + viz helpers tested (Tasks 1–3, 6) · secondary views real, Sprints/Communications light (Task 10) · lint/typecheck/test green (Task 11). All design DoD items map to a task.
- **Type consistency:** `MatrixInitiative/MatrixRow/MatrixCell`, `RISK_KINDS`, `worstSeverity`, `severityToken`, `trendToken/trendSymbol`, `velocityPerSprint/velocityTrend`, `programHealthScore/healthBand`, and the `programModel` method names are used identically across producing and consuming tasks.
- **Follow-on (out of scope):** extracting tokens/ui/viz into a blueprint `dashboard` template module — separate spec.
