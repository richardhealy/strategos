export const metadata = {
  title: "Privacy Policy — strategos",
  description: "How strategos handles program data and integration credentials.",
};

// Template privacy policy for the strategos portfolio project. Review with
// counsel before relying on it for a production deployment.
export default function PrivacyPage() {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "48px 24px", lineHeight: 1.6 }}>
      <a href="/" style={{ opacity: 0.7, textDecoration: "none", color: "inherit" }}>← Back</a>
      <h1 style={{ fontSize: 28, marginTop: 16 }}>Privacy Policy</h1>
      <p style={{ opacity: 0.6, marginTop: 0 }}>Last updated: July 2, 2026</p>

      <p>
        <strong>strategos</strong> is an autonomous Technical Program Manager. It reads
        program data from connected tools, maintains a program state model, and drafts
        stakeholder communication. This policy explains what data it processes and how.
      </p>

      <h2 style={{ fontSize: 18, marginTop: 32 }}>Data we process</h2>
      <ul>
        <li><strong>Integration credentials</strong> — API tokens and webhook secrets for Linear, Jira, GitHub, GitLab, and Azure DevOps, used only to sync the connected programs.</li>
        <li><strong>Program metadata</strong> — initiatives, epics, tasks, dependencies, velocity, and delivery history synced from those integrations.</li>
        <li><strong>Account data</strong> — the email and profile provided when signing in with Google to access the dashboard.</li>
        <li><strong>Operational logs</strong> — an audit trail of every agent action and human approval decision, retained for provenance.</li>
      </ul>

      <h2 style={{ fontSize: 18, marginTop: 32 }}>How we use it</h2>
      <ul>
        <li>To model program state, score schedule risk, and draft status updates, agendas, and summaries.</li>
        <li>To notify approvers of items awaiting a human-in-the-loop (HITL) decision.</li>
        <li>No external action — no ticket write, no message send — is taken without explicit human approval.</li>
      </ul>

      <h2 style={{ fontSize: 18, marginTop: 32 }}>Sharing</h2>
      <p>
        We do not sell your data. Program data is shared only with the integrations you
        connect and the subprocessors required to run the service (hosting, error tracking,
        transactional email). Drafted communication is never sent until you approve it.
      </p>

      <h2 style={{ fontSize: 18, marginTop: 32 }}>Retention &amp; your choices</h2>
      <p>
        Program state and audit logs are retained while a program is connected. Disconnecting
        an integration revokes further syncing. You may request export or deletion of your
        account data at any time.
      </p>

      <h2 style={{ fontSize: 18, marginTop: 32 }}>Contact</h2>
      <p>Questions about this policy? Email <a href="mailto:privacy@strategos.example.com" style={{ color: "#7aa2f7" }}>privacy@strategos.example.com</a>.</p>

      <p style={{ marginTop: 32 }}><a href="/terms" style={{ color: "#7aa2f7" }}>Terms of Service →</a></p>
    </main>
  );
}
