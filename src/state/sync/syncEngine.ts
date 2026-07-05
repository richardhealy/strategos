import type { IntegrationKind } from "@prisma/client";
import { db } from "@/db";
import { integrationFor } from "@/integrations/registry";
import { upsertByRef } from "@/state/sync/reconcile";
import { resolveProgram } from "@/state/sync/program";
import { recomputeRisk } from "@/state/model/recompute";
import { log } from "@/logger";

export async function syncIntegration(kind: IntegrationKind) {
  const logger = log.child({ op: "sync", integration: kind });
  const integration = integrationFor(kind);
  const programId = await resolveProgram(kind);
  const source = `sync:${kind.toLowerCase()}`;

  // Initiatives (Projects)
  const { items: inits } = await integration.pullInitiatives({});
  for (const raw of inits) {
    await upsertByRef({
      kind, externalId: raw.externalId, entityType: "Initiative", source,
      load: async () => {
        const ref = await db.externalRef.findUnique({ where: { kind_externalId: { kind, externalId: raw.externalId } } });
        return ref?.initiativeId ? db.initiative.findUnique({ where: { id: ref.initiativeId } }) : null;
      },
      create: () => db.initiative.create({ data: { programId, title: raw.title, owner: raw.owner, status: "IN_PROGRESS", managed: raw.managed ?? false, mode: raw.mode ?? "HUMAN", targetDate: raw.targetDate ? new Date(raw.targetDate) : null } }),
      update: (row) => db.initiative.update({ where: { id: row.id }, data: { title: raw.title, owner: raw.owner, managed: raw.managed ?? false, mode: raw.mode ?? "HUMAN", targetDate: raw.targetDate ? new Date(raw.targetDate) : null } }),
      changed: (row) => row.title !== raw.title || (row.owner ?? undefined) !== raw.owner || row.managed !== (raw.managed ?? false) || row.mode !== (raw.mode ?? "HUMAN"),
    });
  }

  // Epics (Milestones + General) — resolve parent initiative via its ExternalRef
  const { items: epics } = await integration.pullEpics({});
  for (const raw of epics) {
    const parentRef = raw.initiativeExternalId
      ? await db.externalRef.findUnique({ where: { kind_externalId: { kind, externalId: raw.initiativeExternalId } } })
      : null;
    if (!parentRef?.initiativeId) continue; // parent project out of scope
    const initiativeId = parentRef.initiativeId;
    await upsertByRef({
      kind, externalId: raw.externalId, entityType: "Epic", source,
      load: async () => {
        const ref = await db.externalRef.findUnique({ where: { kind_externalId: { kind, externalId: raw.externalId } } });
        return ref?.epicId ? db.epic.findUnique({ where: { id: ref.epicId } }) : null;
      },
      create: () => db.epic.create({ data: { initiativeId, title: raw.title, status: "IN_PROGRESS", targetDate: raw.targetDate ? new Date(raw.targetDate) : null } }),
      update: (row) => db.epic.update({ where: { id: row.id }, data: { title: raw.title } }),
      changed: (row) => row.title !== raw.title,
    });
  }

  // Tasks (Issues) — resolve parent epic via its ExternalRef
  const { items: tasks } = await integration.pullTasks({});
  for (const raw of tasks) {
    const epicRef = raw.epicExternalId
      ? await db.externalRef.findUnique({ where: { kind_externalId: { kind, externalId: raw.epicExternalId } } })
      : null;
    if (!epicRef?.epicId) continue;
    const epicId = epicRef.epicId;
    const doneish = raw.status === "completed" || raw.status === "canceled";
    await upsertByRef({
      kind, externalId: raw.externalId, entityType: "Task", source,
      load: async () => {
        const ref = await db.externalRef.findUnique({ where: { kind_externalId: { kind, externalId: raw.externalId } } });
        return ref?.taskId ? db.task.findUnique({ where: { id: ref.taskId } }) : null;
      },
      create: () => db.task.create({ data: { epicId, title: raw.title, status: doneish ? "DONE" : "IN_PROGRESS", estimatePoints: raw.estimatePoints ?? null, priority: raw.priority ?? null, description: raw.description ?? null, assignee: raw.assignee ?? null } }),
      update: (row) => db.task.update({ where: { id: row.id }, data: { title: raw.title, status: doneish ? "DONE" : "IN_PROGRESS", estimatePoints: raw.estimatePoints ?? null, priority: raw.priority ?? null, description: raw.description ?? null, assignee: raw.assignee ?? null } }),
      changed: (row) => row.title !== raw.title || (row.status === "DONE") !== doneish || (row.estimatePoints ?? null) !== (raw.estimatePoints ?? null) || (row.priority ?? null) !== (raw.priority ?? null),
    });
  }

  // Task dependencies (Linear blocked-by). Rebuild each task's edges from the
  // freshly pulled blockers, resolving external issue ids to task ids.
  for (const raw of tasks) {
    const selfRef = await db.externalRef.findUnique({ where: { kind_externalId: { kind, externalId: raw.externalId } } });
    if (!selfRef?.taskId) continue;
    const blockedTaskId = selfRef.taskId;
    const blockerIds: string[] = [];
    for (const bx of raw.blockerExternalIds ?? []) {
      const bref = await db.externalRef.findUnique({ where: { kind_externalId: { kind, externalId: bx } } });
      if (bref?.taskId) blockerIds.push(bref.taskId);
    }
    await db.taskDependency.deleteMany({ where: { blockedTaskId } });
    for (const blockerTaskId of blockerIds) {
      if (blockerTaskId === blockedTaskId) continue;
      await db.taskDependency.create({ data: { blockedTaskId, blockerTaskId } });
    }
  }

  // Velocity (Cycles) — one snapshot per (team,cycle); teams resolved by name
  const { items: delivery } = await integration.pullDeliveryHistory({});
  let velocity = 0;
  for (const d of delivery) {
    const team = await db.team.upsert({
      where: { id: `team:${kind}:${d.teamKey}` },
      create: { id: `team:${kind}:${d.teamKey}`, programId, name: d.teamKey },
      update: {},
    });
    await db.velocitySnapshot.create({
      data: { teamId: team.id, periodStart: new Date(d.completedAt), periodEnd: new Date(d.completedAt), completedPts: d.points, committedPts: d.points },
    });
    velocity++;
  }

  const { scored } = await recomputeRisk(programId);
  const out = { initiatives: inits.length, epics: epics.length, tasks: tasks.length, velocity, scored };
  logger.info("sync complete", out);
  return out;
}

export async function syncAll(): Promise<Record<string, unknown>> {
  const kinds: IntegrationKind[] = ["LINEAR", "GITHUB", "JIRA", "GITLAB", "AZURE_DEVOPS"];
  const out: Record<string, unknown> = {};
  for (const kind of kinds) {
    try { out[kind] = await syncIntegration(kind); }
    catch (err) { log.error("sync failed", { kind, err: String(err) }); out[kind] = { error: String(err) }; }
  }
  return out;
}
