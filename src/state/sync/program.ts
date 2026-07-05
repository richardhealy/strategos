import type { IntegrationKind } from "@prisma/client";
import { db } from "@/db";
import { linearConfig } from "@/config/linear";

function programScope(kind: IntegrationKind): string {
  return kind === "LINEAR" ? (linearConfig().teamKeys.join(",") || "all") : "all";
}

// The program already anchored for this kind, or null. Read-only: never creates,
// so a sync can check for prior state before deciding to materialize a program.
export async function findProgram(kind: IntegrationKind): Promise<string | null> {
  const cursor = await db.syncCursor.findUnique({ where: { kind_resource: { kind, resource: "__program__" } } });
  if (cursor?.cursor) {
    const existing = await db.program.findUnique({ where: { id: cursor.cursor }, select: { id: true } });
    if (existing) return existing.id;
  }
  return null;
}

// One program per (kind + configured team scope), anchored by a synthetic
// "__program__" SyncCursor whose cursor holds the program id, so re-syncs reuse
// the same program. Creates it (and the cursor) on first use.
export async function resolveProgram(kind: IntegrationKind): Promise<string> {
  const existing = await findProgram(kind);
  if (existing) return existing;
  const program = await db.program.create({ data: { name: `${kind} — ${programScope(kind)}` } });
  await db.syncCursor.upsert({
    where: { kind_resource: { kind, resource: "__program__" } },
    create: { kind, resource: "__program__", cursor: program.id, lastSynced: new Date() },
    update: { cursor: program.id, lastSynced: new Date() },
  });
  return program.id;
}
