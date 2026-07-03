import { db } from "@/db";
import { buildRiskMatrix, type MatrixRow } from "@/state/model/matrix";
import { velocityTrend } from "@/agents/risk/velocity";
import { programHealthScore, healthBand } from "@/state/model/health";
import type { VelocityTrend } from "@prisma/client";

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

  // ----- dashboard read methods -----

  async firstProgramId(): Promise<string | null> {
    const p = await db.program.findFirst({ orderBy: { createdAt: "asc" } });
    return p?.id ?? null;
  },

  // Prefer a program created by live sync (anchored by a "__program__" SyncCursor
  // whose cursor = programId); fall back to the oldest program (the demo seed).
  async primaryProgramId(): Promise<string | null> {
    const syncedCursors = await db.syncCursor.findMany({ where: { resource: "__program__" }, orderBy: { updatedAt: "desc" } });
    for (const c of syncedCursors) {
      if (c.cursor) {
        const p = await db.program.findUnique({ where: { id: c.cursor }, select: { id: true } });
        if (p) return p.id;
      }
    }
    const oldest = await db.program.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
    return oldest?.id ?? null;
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
      const tone: "low" | "medium" | "high" | "critical" = sev === "CRITICAL" ? "critical" : sev === "HIGH" ? "high" : sev === "MEDIUM" ? "medium" : "low";
      return { id: i.id, title: i.title, owner: i.owner, progress, forecast, tone };
    });
  },

  async recentActivity(limit = 12) {
    const rows = await db.actionLog.findMany({ orderBy: { at: "desc" }, take: limit });
    return rows.map((r) => ({ id: r.id, actor: r.actor, action: r.action, at: r.at }));
  },
};
