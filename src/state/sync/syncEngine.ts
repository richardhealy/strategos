import type { IntegrationKind } from "@prisma/client";
import { db } from "@/db";
import { integrationFor } from "@/integrations/registry";
import { upsertByRef } from "@/state/sync/reconcile";
import { resolveProgram } from "@/state/sync/program";
import { recomputeRisk } from "@/state/model/recompute";
import { log } from "@/logger";

// The write phase is latency-bound: thousands of tiny queries against a remote
// (Neon) Postgres, where each round-trip dominates. Two structural fixes keep it
// from taking an hour:
//   1. Resolve identity/parentage from an in-memory snapshot of ExternalRef
//      instead of a findUnique per item (kills the N+1 lookups).
//   2. Run each phase's independent writes through a small concurrency pool
//      instead of one sequential `await` at a time.
const CONCURRENCY = Math.max(1, Number(process.env.SYNC_CONCURRENCY ?? 10));
const PROGRESS_EVERY = 200;

// Bounded-concurrency map: at most CONCURRENCY calls of `fn` in flight. Items are
// independent within a phase (parentage always resolves to a prior, completed
// phase), so ordering doesn't matter here.
async function pool<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
  onProgress?: (done: number) => void,
): Promise<void> {
  let next = 0;
  let done = 0;
  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      await fn(items[i]!);
      done++;
      if (onProgress && done % PROGRESS_EVERY === 0) onProgress(done);
    }
  }
  const lanes = Math.min(CONCURRENCY, items.length);
  await Promise.all(Array.from({ length: lanes }, worker));
}

// One-shot snapshot of every ExternalRef for a kind, keyed by externalId. Rebuilt
// at the start of each phase so refs created by the previous phase are visible.
type RefRow = { externalId: string; initiativeId: string | null; epicId: string | null; taskId: string | null };
async function refMap(kind: IntegrationKind): Promise<Map<string, RefRow>> {
  const refs = await db.externalRef.findMany({
    where: { kind },
    select: { externalId: true, initiativeId: true, epicId: true, taskId: true },
  });
  return new Map(refs.map((r) => [r.externalId, r]));
}

export async function syncIntegration(kind: IntegrationKind) {
  const logger = log.child({ op: "sync", integration: kind });
  const integration = integrationFor(kind);
  const programId = await resolveProgram(kind);
  const source = `sync:${kind.toLowerCase()}`;

  // Initiatives (Projects)
  const { items: inits } = await integration.pullInitiatives({});
  let refs = await refMap(kind);
  await pool(inits, (raw) =>
    upsertByRef({
      kind, externalId: raw.externalId, entityType: "Initiative", source,
      load: async () => {
        const ref = refs.get(raw.externalId);
        return ref?.initiativeId ? db.initiative.findUnique({ where: { id: ref.initiativeId } }) : null;
      },
      create: () => db.initiative.create({ data: { programId, title: raw.title, owner: raw.owner, status: "IN_PROGRESS", managed: raw.managed ?? false, mode: raw.mode ?? "HUMAN", targetDate: raw.targetDate ? new Date(raw.targetDate) : null } }),
      update: (row) => db.initiative.update({ where: { id: row.id }, data: { title: raw.title, owner: raw.owner, managed: raw.managed ?? false, mode: raw.mode ?? "HUMAN", targetDate: raw.targetDate ? new Date(raw.targetDate) : null } }),
      changed: (row) => row.title !== raw.title || (row.owner ?? undefined) !== raw.owner || row.managed !== (raw.managed ?? false) || row.mode !== (raw.mode ?? "HUMAN"),
    }).then(() => undefined),
  );
  logger.info("wrote initiatives", { count: inits.length });

  // Epics (Milestones + General) — resolve parent initiative via its ExternalRef
  const { items: epics } = await integration.pullEpics({});
  refs = await refMap(kind);
  await pool(epics, (raw) => {
    const parentRef = raw.initiativeExternalId ? refs.get(raw.initiativeExternalId) : null;
    if (!parentRef?.initiativeId) return Promise.resolve(); // parent project out of scope
    const initiativeId = parentRef.initiativeId;
    return upsertByRef({
      kind, externalId: raw.externalId, entityType: "Epic", source,
      load: async () => {
        const ref = refs.get(raw.externalId);
        return ref?.epicId ? db.epic.findUnique({ where: { id: ref.epicId } }) : null;
      },
      create: () => db.epic.create({ data: { initiativeId, title: raw.title, status: "IN_PROGRESS", targetDate: raw.targetDate ? new Date(raw.targetDate) : null } }),
      update: (row) => db.epic.update({ where: { id: row.id }, data: { title: raw.title } }),
      changed: (row) => row.title !== raw.title,
    }).then(() => undefined);
  });
  logger.info("wrote epics", { count: epics.length });

  // Tasks (Issues) — resolve parent epic via its ExternalRef
  const { items: tasks } = await integration.pullTasks({});
  refs = await refMap(kind);
  await pool(tasks, (raw) => {
    const epicRef = raw.epicExternalId ? refs.get(raw.epicExternalId) : null;
    if (!epicRef?.epicId) return Promise.resolve();
    const epicId = epicRef.epicId;
    const doneish = raw.status === "completed" || raw.status === "canceled";
    return upsertByRef({
      kind, externalId: raw.externalId, entityType: "Task", source,
      load: async () => {
        const ref = refs.get(raw.externalId);
        return ref?.taskId ? db.task.findUnique({ where: { id: ref.taskId } }) : null;
      },
      create: () => db.task.create({ data: { epicId, title: raw.title, status: doneish ? "DONE" : "IN_PROGRESS", estimatePoints: raw.estimatePoints ?? null, priority: raw.priority ?? null, description: raw.description ?? null, assignee: raw.assignee ?? null } }),
      update: (row) => db.task.update({ where: { id: row.id }, data: { title: raw.title, status: doneish ? "DONE" : "IN_PROGRESS", estimatePoints: raw.estimatePoints ?? null, priority: raw.priority ?? null, description: raw.description ?? null, assignee: raw.assignee ?? null } }),
      changed: (row) => row.title !== raw.title || (row.status === "DONE") !== doneish || (row.estimatePoints ?? null) !== (raw.estimatePoints ?? null) || (row.priority ?? null) !== (raw.priority ?? null),
    }).then(() => undefined);
  }, (done) => logger.info("writing tasks", { done, total: tasks.length }));
  logger.info("wrote tasks", { count: tasks.length });

  // Task dependencies (Linear blocked-by). Rebuild each task's edges from the
  // freshly pulled blockers, resolving external issue ids to task ids. Reload the
  // map first so every task ref created above is visible.
  refs = await refMap(kind);
  await pool(tasks, async (raw) => {
    const selfRef = refs.get(raw.externalId);
    if (!selfRef?.taskId) return;
    const blockedTaskId = selfRef.taskId;
    const blockerIds = (raw.blockerExternalIds ?? [])
      .map((bx) => refs.get(bx)?.taskId)
      .filter((id): id is string => !!id && id !== blockedTaskId);
    await db.taskDependency.deleteMany({ where: { blockedTaskId } });
    if (blockerIds.length) {
      await db.taskDependency.createMany({
        data: blockerIds.map((blockerTaskId) => ({ blockedTaskId, blockerTaskId })),
        skipDuplicates: true,
      });
    }
  }, (done) => logger.info("writing dependencies", { done, total: tasks.length }));

  // Velocity (Cycles) — one snapshot per (team,cycle); teams resolved by name.
  // Kept sequential: several delivery events can share a team, and concurrent
  // upserts of the same new team id would race on the unique constraint.
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
