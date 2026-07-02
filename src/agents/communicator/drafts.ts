import { complete } from "@/llm/client";

export type Channel = "exec-update" | "agenda" | "summary" | "follow-up";

const SYSTEMS: Record<Channel, string> = {
  "exec-update":
    "Draft a concise executive status update: initiative status, key achievements, " +
    "risks with mitigations, upcoming milestones. Calibrated for leadership. No em dashes.",
  agenda:
    "Draft a meeting agenda from open risks, upcoming milestones, and decision items. No em dashes.",
  summary:
    "Draft a post-meeting summary: decisions, action items, and owners. No em dashes.",
  "follow-up":
    "Draft a short action-item follow-up to owners with current status. No em dashes.",
};

// Every draft is grounded ONLY in the supplied program-state context, so the
// eval grader can check it for fabrication before a human ever sees it.
export async function draftCommunication(channel: Channel, context: string): Promise<string> {
  return complete({ system: SYSTEMS[channel], prompt: context, maxTokens: 1500 });
}
