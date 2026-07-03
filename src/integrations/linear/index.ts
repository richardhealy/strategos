import type { IntegrationKind } from "@prisma/client";
import type {
  Integration, PullSince, PullResult,
  RawInitiative, RawEpic, RawTask, DeliveryEvent,
} from "@/integrations/types";
import { linearConfig } from "@/config/linear";
import { pullProjects, pullMilestones, pullIssues, pullDelivery } from "@/integrations/linear/pull";
import { verifyLinearSignature, withinReplayWindow, parseLinearWebhook } from "@/integrations/linear/webhook";
import { writeIssue } from "@/integrations/linear/write";

// Tickets, epics, cycles via the Linear SDK. Reads are live (L1); webhook verify
// and writes are the next phases (L2/L3).
export class LinearIntegration implements Integration {
  readonly kind: IntegrationKind = "LINEAR";

  async pullInitiatives(_since: PullSince): Promise<PullResult<RawInitiative>> {
    const items = await pullProjects(linearConfig().teamKeys);
    return { items, nextCursor: null };
  }

  async pullEpics(_since: PullSince): Promise<PullResult<RawEpic>> {
    const items = await pullMilestones(linearConfig().teamKeys);
    return { items, nextCursor: null };
  }

  async pullTasks(_since: PullSince): Promise<PullResult<RawTask>> {
    const items = await pullIssues(linearConfig().teamKeys);
    return { items, nextCursor: null };
  }

  async pullDeliveryHistory(_since: PullSince): Promise<PullResult<DeliveryEvent>> {
    const items = await pullDelivery(linearConfig().teamKeys);
    return { items, nextCursor: null };
  }

  verifyWebhook(headers: Record<string, string>, body: string): boolean {
    const secret = process.env.LINEAR_WEBHOOK_SECRET;
    if (!secret) return false;
    if (!verifyLinearSignature(body, headers["linear-signature"], secret)) return false;
    let ts: number | undefined;
    try {
      ts = (JSON.parse(body) as { webhookTimestamp?: number }).webhookTimestamp;
    } catch {
      return false;
    }
    return withinReplayWindow(ts, Date.now());
  }

  parseWebhook(body: string): { resource: string; externalId: string } {
    return parseLinearWebhook(body);
  }

  async writeTicket(payload: unknown): Promise<{ externalId: string; url?: string }> {
    // Reached ONLY via the HITL gate after human approval.
    return writeIssue(payload);
  }
}
