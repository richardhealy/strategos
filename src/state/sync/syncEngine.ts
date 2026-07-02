import type { IntegrationKind } from "@prisma/client";
import { db } from "@/db";
import { integrationFor } from "@/integrations/registry";
import { recordChange } from "@/state/versioned/provenance";
import { log } from "@/logger";

// Pull the latest state from an integration and reconcile it into the program
// model, writing a provenance row for every field that actually changed.
export async function syncIntegration(kind: IntegrationKind): Promise<{ upserts: number }> {
  const logger = log.child({ op: "sync", integration: kind });
  const integration = integrationFor(kind);
  let upserts = 0;

  const cursorRow = await db.syncCursor.findUnique({
    where: { kind_resource: { kind, resource: "epics" } },
  });

  const { items, nextCursor } = await integration.pullEpics({ cursor: cursorRow?.cursor });
  logger.info("pulled epics", { count: items.length });

  for (const raw of items) {
    // TODO(M1): map RawEpic -> Epic via ExternalRef, diff, upsert, recordChange.
    // Placeholder to keep the reconcile path honest and typed:
    await recordChange({
      entityType: "Epic",
      entityId: raw.externalId,
      field: "sync",
      before: null,
      after: raw,
      source: `sync:${kind.toLowerCase()}`,
    });
    upserts += 1;
  }

  await db.syncCursor.upsert({
    where: { kind_resource: { kind, resource: "epics" } },
    create: { kind, resource: "epics", cursor: nextCursor ?? null, lastSynced: new Date() },
    update: { cursor: nextCursor ?? null, lastSynced: new Date() },
  });

  return { upserts };
}

export async function syncAll(): Promise<Record<string, number>> {
  const kinds: IntegrationKind[] = ["LINEAR", "GITHUB", "JIRA", "GITLAB", "AZURE_DEVOPS"];
  const out: Record<string, number> = {};
  for (const kind of kinds) {
    try {
      const { upserts } = await syncIntegration(kind);
      out[kind] = upserts;
    } catch (err) {
      log.error("sync failed", { kind, err: String(err) });
      out[kind] = -1;
    }
  }
  return out;
}
