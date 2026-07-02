import { Sidebar } from "@/components/ui/Sidebar";

// Route group (dash) gives every dashboard page the sidebar shell without
// affecting the URL. /privacy and /terms stay outside it (no sidebar).
export default function DashLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar programName="Payments Platform" />
      <main style={{ flex: 1, padding: "18px 22px" }}>{children}</main>
    </div>
  );
}
