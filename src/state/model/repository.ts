import { db } from "@/db";

// Thin read facade the agents use to reason over the model instead of raw
// tickets. Kept deliberately small in M0; grows with each agent milestone.
export const programModel = {
  async health(programId: string) {
    const [initiatives, openRisks] = await Promise.all([
      db.initiative.findMany({ where: { programId }, include: { riskScores: true } }),
      db.riskScore.count({ where: { initiative: { programId }, severity: { in: ["HIGH", "CRITICAL"] } } }),
    ]);
    return { initiatives, openRisks };
  },

  async initiativesWithOpenWork(programId: string) {
    return db.initiative.findMany({
      where: { programId, status: { in: ["PLANNED", "IN_PROGRESS", "BLOCKED"] } },
      include: { epics: { include: { tasks: true, dependsOn: true } } },
    });
  },

  async latestVelocity(teamId: string) {
    return db.velocitySnapshot.findFirst({
      where: { teamId },
      orderBy: { periodStart: "desc" },
    });
  },
};
