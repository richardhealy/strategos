import type { IntegrationKind } from "@prisma/client";

// A normalized snapshot pulled from any tracker. Sync maps these onto the
// program state model; the model never speaks a vendor's raw dialect.
export interface RawInitiative {
  externalId: string;
  title: string;
  owner?: string;
  status: string;
  targetDate?: string;
  url?: string;
}

export interface RawEpic {
  externalId: string;
  initiativeExternalId?: string;
  teamKey?: string;
  title: string;
  status: string;
  estimatePoints?: number;
  targetDate?: string;
  dependsOnExternalIds?: string[];
  url?: string;
}

export interface RawTask {
  externalId: string;
  epicExternalId?: string;
  title: string;
  status: string;
  estimatePoints?: number;
  assignee?: string;
  updatedAt?: string;
  url?: string;
}

export interface DeliveryEvent {
  // A completed unit of work, used to compute velocity.
  teamKey: string;
  points: number;
  completedAt: string;
}

export interface PullSince {
  // Delta token from the previous sync, if the source supports it.
  cursor?: string | null;
}

export interface PullResult<T> {
  items: T[];
  nextCursor?: string | null;
}

// The port every integration implements. write* methods are only ever called
// by the HITL gate after human approval (see src/hitl/gate.ts).
export interface Integration {
  readonly kind: IntegrationKind;

  // --- reads (always allowed) ---
  pullInitiatives(since: PullSince): Promise<PullResult<RawInitiative>>;
  pullEpics(since: PullSince): Promise<PullResult<RawEpic>>;
  pullTasks(since: PullSince): Promise<PullResult<RawTask>>;
  pullDeliveryHistory(since: PullSince): Promise<PullResult<DeliveryEvent>>;

  // --- webhook ingestion ---
  verifyWebhook(headers: Record<string, string>, body: string): boolean;
  parseWebhook(body: string): { resource: string; externalId: string };

  // --- writes (guarded; never call directly) ---
  writeTicket(payload: unknown): Promise<{ externalId: string; url?: string }>;
}
