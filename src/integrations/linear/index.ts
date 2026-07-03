import type { IntegrationKind } from "@prisma/client";
import type {
  Integration, PullSince, PullResult,
  RawInitiative, RawEpic, RawTask, DeliveryEvent,
} from "@/integrations/types";
import { linearConfig } from "@/config/linear";
import { pullProjects, pullMilestones, pullIssues, pullDelivery } from "@/integrations/linear/pull";

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

  verifyWebhook(_headers: Record<string, string>, _body: string): boolean {
    // L2: HMAC-verify with LINEAR_WEBHOOK_SECRET before trusting any payload.
    return false;
  }

  parseWebhook(_body: string): { resource: string; externalId: string } {
    throw new Error("LinearIntegration.parseWebhook not implemented (L2)");
  }

  async writeTicket(_payload: unknown): Promise<{ externalId: string; url?: string }> {
    // Reached ONLY via the HITL gate after human approval (L3).
    throw new Error("LinearIntegration.writeTicket not implemented (L3)");
  }
}
