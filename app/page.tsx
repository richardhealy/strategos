import { programModel } from "@/state/model/repository";
import { pendingProposals } from "@/hitl/queue";

// Thin leadership dashboard: program health, open risks, and the HITL inbox.
// Grows into the risk heatmap + velocity trend in M7.
export default async function Home() {
  const programId = "default";
  let health: Awaited<ReturnType<typeof programModel.health>> | null = null;
  let pending: Awaited<ReturnType<typeof pendingProposals>> = [];

  try {
    health = await programModel.health(programId);
    pending = await pendingProposals();
  } catch {
    // Pre-migration / empty DB: render the shell.
  }

  return (
    <main style={{ maxWidth: 880, margin: "0 auto", padding: "48px 24px" }}>
      <h1 style={{ fontSize: 28, marginBottom: 4 }}>strategos</h1>
      <p style={{ opacity: 0.7, marginTop: 0 }}>Autonomous AI Technical Program Manager</p>

      <section style={{ marginTop: 32 }}>
        <h2 style={{ fontSize: 18 }}>Program health</h2>
        <p>Initiatives tracked: {health?.initiatives.length ?? 0}</p>
        <p>Open high/critical risks: {health?.openRisks ?? 0}</p>
      </section>

      <section style={{ marginTop: 32 }}>
        <h2 style={{ fontSize: 18 }}>Approval inbox ({pending.length})</h2>
        {pending.length === 0 ? (
          <p style={{ opacity: 0.6 }}>Nothing awaiting approval.</p>
        ) : (
          <ul>
            {pending.map((p) => (
              <li key={p.id}>
                <strong>{p.kind}</strong>: {p.summary}
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer style={{ marginTop: 48, paddingTop: 16, borderTop: "1px solid #1c2230", fontSize: 13, opacity: 0.6 }}>
        <a href="/privacy" style={{ color: "inherit", marginRight: 16 }}>Privacy</a>
        <a href="/terms" style={{ color: "inherit" }}>Terms</a>
      </footer>
    </main>
  );
}
