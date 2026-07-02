import { db } from "@/db";

// The approval inbox surfaced on the dashboard.
export function pendingProposals() {
  return db.hitlProposal.findMany({
    where: { state: "PENDING" },
    orderBy: { createdAt: "asc" },
    include: { draft: true },
  });
}
