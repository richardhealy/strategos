import { NextRequest, NextResponse } from "next/server";
import type { IntegrationKind } from "@prisma/client";
import { integrationFor } from "@/integrations/registry";
import { inngest } from "@/schedule/inngest";

const KIND_MAP: Record<string, IntegrationKind> = {
  linear: "LINEAR",
  github: "GITHUB",
  jira: "JIRA",
  gitlab: "GITLAB",
  azuredevops: "AZURE_DEVOPS",
};

// Verify the signature, then hand off to the durable on-event routine.
export async function POST(req: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const { kind: kindParam } = await params;
  const kind = KIND_MAP[kindParam];
  if (!kind) return NextResponse.json({ error: "unknown integration" }, { status: 404 });

  const body = await req.text();
  const headers = Object.fromEntries(req.headers.entries());
  const integration = integrationFor(kind);

  if (!integration.verifyWebhook(headers, body)) {
    return NextResponse.json({ error: "signature verification failed" }, { status: 401 });
  }

  await inngest.send({ name: "integration/webhook", data: { kind, body } });
  return NextResponse.json({ ok: true });
}
