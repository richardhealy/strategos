import { Sidebar } from "@/components/ui/Sidebar";
import { programModel } from "@/state/model/repository";
import { db } from "@/db";

// Route group (dash) gives every dashboard page the sidebar shell without
// affecting the URL. /privacy and /terms stay outside it (no sidebar).
export default async function DashLayout({ children }: { children: React.ReactNode }) {
  const pid = await programModel.primaryProgramId();
  const program = pid ? await db.program.findUnique({ where: { id: pid }, select: { name: true } }) : null;
  return (
    <div className="dash-shell">
      <Sidebar programName={program?.name ?? "No program"} />
      <main className="dash-main">{children}</main>
    </div>
  );
}
