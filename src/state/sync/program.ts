import type { IntegrationKind } from "@prisma/client";
import { db } from "@/db";
import { linearConfig } from "@/config/linear";

// One program per (kind + configured team scope), anchored by a synthetic
// "__program__" SyncCursor whose cursor holds the program id, so re-syncs reuse
// the same program.
export async function resolveProgram(kind: IntegrationKind): Promise<string> {
  const scope = kind === "LINEAR" ? (linearConfig().teamKeys.join(",") || "all") : "all";
  const cursor = await db.syncCursor.findUnique({ where: { kind_resource: { kind, resource: "__program__" } } });
  if (cursor?.cursor) {
    const existing = await db.program.findUnique({ where: { id: cursor.cursor }, select: { id: true } });
    if (existing) return existing.id;
  }
  const program = await db.program.create({ data: { name: `${kind} — ${scope}` } });
  await db.syncCursor.upsert({
    where: { kind_resource: { kind, resource: "__program__" } },
    create: { kind, resource: "__program__", cursor: program.id, lastSynced: new Date() },
    update: { cursor: program.id, lastSynced: new Date() },
  });
  return program.id;
}
