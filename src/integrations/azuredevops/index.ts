import type { IntegrationKind } from "@prisma/client";
import type {
  Integration, PullSince, PullResult,
  RawInitiative, RawEpic, RawTask, DeliveryEvent,
} from "@/integrations/types";
import { log } from "@/logger";

// M1. Work items, sprints, pipelines, service hooks via the Azure DevOps API.
export class AzureDevOpsIntegration implements Integration {
  readonly kind: IntegrationKind = "AZURE_DEVOPS";
  private readonly logger = log.child({ integration: "azuredevops" });

  async pullInitiatives(_since: PullSince): Promise<PullResult<RawInitiative>> {
    this.logger.warn("pullInitiatives not implemented");
    return { items: [], nextCursor: null };
  }

  async pullEpics(_since: PullSince): Promise<PullResult<RawEpic>> {
    this.logger.warn("pullEpics not implemented");
    return { items: [], nextCursor: null };
  }

  async pullTasks(_since: PullSince): Promise<PullResult<RawTask>> {
    this.logger.warn("pullTasks not implemented");
    return { items: [], nextCursor: null };
  }

  async pullDeliveryHistory(_since: PullSince): Promise<PullResult<DeliveryEvent>> {
    this.logger.warn("pullDeliveryHistory not implemented");
    return { items: [], nextCursor: null };
  }

  verifyWebhook(_headers: Record<string, string>, _body: string): boolean {
    // TODO: HMAC-verify with *_WEBHOOK_SECRET before trusting any payload.
    return false;
  }

  parseWebhook(_body: string): { resource: string; externalId: string } {
    throw new Error("AzureDevOpsIntegration.parseWebhook not implemented");
  }

  async writeTicket(_payload: unknown): Promise<{ externalId: string; url?: string }> {
    // Reached ONLY via the HITL gate after human approval.
    throw new Error("AzureDevOpsIntegration.writeTicket not implemented");
  }
}
