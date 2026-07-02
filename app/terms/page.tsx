export const metadata = {
  title: "Terms of Service — strategos",
  description: "Terms governing use of the strategos program-management agent.",
};

// Template terms of service for the strategos portfolio project. Review with
// counsel before relying on it for a production deployment.
export default function TermsPage() {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "48px 24px", lineHeight: 1.6 }}>
      <a href="/" style={{ opacity: 0.7, textDecoration: "none", color: "inherit" }}>← Back</a>
      <h1 style={{ fontSize: 28, marginTop: 16 }}>Terms of Service</h1>
      <p style={{ opacity: 0.6, marginTop: 0 }}>Last updated: July 2, 2026</p>

      <p>
        By accessing <strong>strategos</strong> you agree to these terms. strategos is
        provided as a portfolio project on an &ldquo;as is&rdquo; basis.
      </p>

      <h2 style={{ fontSize: 18, marginTop: 32 }}>Acceptable use</h2>
      <ul>
        <li>Connect only integrations and programs you are authorized to access.</li>
        <li>Do not use the service to violate the terms of any connected tool (Linear, Jira, GitHub, GitLab, Azure DevOps).</li>
        <li>Do not attempt to bypass the human-in-the-loop approval gate.</li>
      </ul>

      <h2 style={{ fontSize: 18, marginTop: 32 }}>The approval gate</h2>
      <p>
        strategos drafts communication and proposes actions autonomously, but every external
        write — ticket changes, message sends, escalations — requires your explicit approval.
        You are responsible for reviewing drafts before approving them.
      </p>

      <h2 style={{ fontSize: 18, marginTop: 32 }}>No warranty</h2>
      <p>
        Risk scores, delivery predictions, and generated drafts are estimates produced by an
        automated system and may be wrong. They are decision support, not decisions. The
        service is provided without warranties of any kind.
      </p>

      <h2 style={{ fontSize: 18, marginTop: 32 }}>Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, the authors are not liable for any indirect,
        incidental, or consequential damages arising from use of the service.
      </p>

      <h2 style={{ fontSize: 18, marginTop: 32 }}>Changes</h2>
      <p>
        We may update these terms; continued use after a change constitutes acceptance. See
        our <a href="/privacy" style={{ color: "#7aa2f7" }}>Privacy Policy</a> for how we handle data.
      </p>

      <h2 style={{ fontSize: 18, marginTop: 32 }}>Contact</h2>
      <p>Questions? Email <a href="mailto:legal@strategos.example.com" style={{ color: "#7aa2f7" }}>legal@strategos.example.com</a>.</p>
    </main>
  );
}
