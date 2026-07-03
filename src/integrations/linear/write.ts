import { linearClient } from "@/integrations/linear/client";

export interface IssueMutation {
  action: "create" | "update";
  teamId?: string; id?: string; title?: string; description?: string; stateId?: string;
}

export function buildIssueMutation(payload: unknown): IssueMutation {
  const p = (payload ?? {}) as { action?: unknown; issue?: unknown };
  const action = p.action;
  if (action !== "create" && action !== "update") {
    throw new Error("TICKET_WRITE: action must be 'create' or 'update'");
  }
  const issue = (p.issue ?? {}) as Record<string, unknown>;
  const str = (k: string): string | undefined => (typeof issue[k] === "string" ? (issue[k] as string) : undefined);
  const mut: IssueMutation = {
    action, teamId: str("teamId"), id: str("id"), title: str("title"), description: str("description"), stateId: str("stateId"),
  };
  if (action === "create" && !mut.teamId) throw new Error("TICKET_WRITE create requires issue.teamId");
  if (action === "create" && !mut.title) throw new Error("TICKET_WRITE create requires issue.title");
  if (action === "update" && !mut.id) throw new Error("TICKET_WRITE update requires issue.id");
  return mut;
}

// Perform the write. SDK-touching; reached only via the HITL gate.
export async function writeIssue(payload: unknown): Promise<{ externalId: string; url?: string }> {
  const mut = buildIssueMutation(payload);
  const client = linearClient();
  if (mut.action === "create") {
    const res = await client.createIssue({ teamId: mut.teamId!, title: mut.title!, description: mut.description, stateId: mut.stateId });
    const issue = res.issue ? await res.issue : undefined;
    return { externalId: issue?.id ?? "", url: issue?.url };
  }
  const res = await client.updateIssue(mut.id!, { title: mut.title, description: mut.description, stateId: mut.stateId });
  const issue = res.issue ? await res.issue : undefined;
  return { externalId: issue?.id ?? "", url: issue?.url };
}
