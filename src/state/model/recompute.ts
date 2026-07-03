import { db } from "@/db";
import { scoreScheduleRisk } from "@/agents/risk/scoring";
import { velocityPerSprint } from "@/agents/risk/velocity";

const SPRINT_MS = 14 * 24 * 60 * 60 * 1000;

export function sprintsUntil(targetDate: Date | null, now: number): number {
  if (!targetDate) return 0;
  const ms = targetDate.getTime() - now;
  return ms <= 0 ? 0 : Math.ceil(ms / SPRINT_MS);
}

// Recompute SCHEDULE risk for every initiative in a program using the real
// engine over whatever facts are currently in the model (seed OR live sync).
export async function recomputeRisk(programId: string): Promise<{ scored: number }> {
  const now = Date.now();
  const initiatives = await db.initiative.findMany({
    where: { programId },
    include: { epics: { include: { tasks: { select: { status: true, estimatePoints: true } } } } },
  });

  let scored = 0;
  for (const init of initiatives) {
    const tasks = init.epics.flatMap((e) => e.tasks);
    const remainingPoints = tasks.filter((t) => t.status !== "DONE").reduce((s, t) => s + (t.estimatePoints ?? 0), 0);

    // velocity: mean per-sprint completed points across the initiative's teams
    const teamIds = [...new Set(init.epics.map((e) => e.teamId).filter((x): x is string => !!x))];
    const snapshots = teamIds.length
      ? await db.velocitySnapshot.findMany({ where: { teamId: { in: teamIds } }, orderBy: { periodStart: "asc" }, select: { completedPts: true } })
      : [];
    const perSprint = velocityPerSprint(snapshots.map((s) => s.completedPts));

    const risk = scoreScheduleRisk({ remainingPoints, velocityPerSprint: perSprint, sprintsRemaining: sprintsUntil(init.targetDate, now) });

    await db.riskScore.deleteMany({ where: { initiativeId: init.id, kind: "SCHEDULE" } });
    await db.riskScore.create({
      data: {
        initiativeId: init.id, kind: "SCHEDULE", severity: risk.severity, score: risk.score,
        confidence: 0.8, explanation: risk.explanation,
        mitigation: risk.willSlip ? "Re-scope or add capacity next sprint." : undefined,
        escalated: risk.severity === "CRITICAL",
      },
    });
    scored++;
  }
  return { scored };
}
