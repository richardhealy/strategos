import { complete } from "@/llm/client";
import type { CandidateTask, SprintSelection } from "@/agents/sprint/plan";

// The ONLY LLM use in the planner: a human-readable "why this sprint" note.
// Selection is deterministic; a failure here must not block the proposal.
export async function sprintRationale(candidates: CandidateTask[], selection: SprintSelection): Promise<string> {
  const chosen = new Set(selection.taskExternalIds);
  const lines = candidates
    .filter((c) => chosen.has(c.externalId))
    .map((c) => `- ${c.title} (priority ${c.priority ?? "none"})`)
    .join("\n");
  try {
    return await complete({
      system:
        "You are a technical program manager. In 2-3 sentences, explain why this " +
        "sprint selection is sensible given priority and age. No preamble.",
      prompt: `Capacity: ${selection.capacityTarget} tickets.\nSelected:\n${lines}`,
      maxTokens: 300,
    });
  } catch {
    return `Selected the top ${selection.taskExternalIds.length} tickets by priority, then age.`;
  }
}
