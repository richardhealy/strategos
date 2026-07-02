import { inngest } from "@/schedule/inngest";
import { syncIntegration } from "@/state/sync/syncEngine";
import type { IntegrationKind } from "@prisma/client";

// 4. On-event: a verified webhook triggers a targeted model update. The route
//    handler in app/ emits "integration/webhook" after HMAC verification.
export const onWebhook = inngest.createFunction(
  { id: "on-webhook" },
  { event: "integration/webhook" },
  async ({ event, step }) => {
    const kind = event.data.kind as IntegrationKind;
    return step.run("targeted-sync", () => syncIntegration(kind));
  },
);
