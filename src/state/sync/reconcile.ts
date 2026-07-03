import type { IntegrationKind, Prisma } from "@prisma/client";
import { db } from "@/db";
import { recordChange } from "@/state/versioned/provenance";

// The single reconcile primitive: identity via ExternalRef, then create-or-diff.
// entityType is one of the ExternalRef relation columns.
const REL: Record<"Initiative" | "Epic" | "Task", "initiativeId" | "epicId" | "taskId"> = {
  Initiative: "initiativeId", Epic: "epicId", Task: "taskId",
};

export async function upsertByRef<TRow extends { id: string }>(args: {
  kind: IntegrationKind;
  externalId: string;
  entityType: "Initiative" | "Epic" | "Task";
  load: () => Promise<TRow | null>;
  create: () => Promise<TRow>;
  update: (row: TRow) => Promise<TRow>;
  changed: (row: TRow) => boolean;
  source: string;
}): Promise<{ row: TRow; changed: boolean }> {
  const existing = await args.load();
  if (!existing) {
    const row = await args.create();
    const data: Prisma.ExternalRefUncheckedCreateInput = { kind: args.kind, externalId: args.externalId };
    data[REL[args.entityType]] = row.id;
    await db.externalRef.create({ data });
    return { row, changed: true };
  }
  if (args.changed(existing)) {
    const row = await args.update(existing);
    await recordChange({ entityType: args.entityType, entityId: existing.id, field: "sync", before: existing, after: row, source: args.source });
    return { row, changed: true };
  }
  return { row: existing, changed: false };
}
