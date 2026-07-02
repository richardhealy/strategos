import { db } from "@/db";

// Record every model change so the program is queryable as-of any point in
// time and every mutation has a traceable source. This is the audit backbone.
export async function recordChange(input: {
  entityType: string;
  entityId: string;
  field: string;
  before: unknown;
  after: unknown;
  source: string; // e.g. "sync:linear", "agent:planner", "hitl:apply"
}): Promise<void> {
  await db.stateChange.create({
    data: {
      entityType: input.entityType,
      entityId: input.entityId,
      field: input.field,
      before: input.before as object,
      after: input.after as object,
      source: input.source,
    },
  });
}

// Convenience: log an agent action (whether or not it touched the outside).
export async function recordAction(input: {
  actor: string;
  action: string;
  detail?: unknown;
  proposalId?: string;
}): Promise<void> {
  await db.actionLog.create({
    data: {
      actor: input.actor,
      action: input.action,
      detail: input.detail as object,
      proposalId: input.proposalId,
    },
  });
}
