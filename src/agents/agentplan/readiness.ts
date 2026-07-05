import { complete } from "@/llm/client";
import { agentModeConfig } from "@/config/agentmode";

export type Readiness = "READY" | "NEEDS_SPEC" | "BLOCKED";
export interface ReadyTask { externalId: string; title: string; description: string | null }
export interface Verdict { externalId: string; status: Readiness; reason: string }

const VALID: Readiness[] = ["READY", "NEEDS_SPEC", "BLOCKED"];

// Pure: turn the model's reply into one verdict per batch task. Any task the
// model omitted, or any unparseable output, defaults to NEEDS_SPEC (safe: it
// won't be dispatched without a human look).
export function parseReadiness(raw: string, batch: ReadyTask[]): Verdict[] {
  let rows: { externalId?: string; status?: string; reason?: string }[] = [];
  try {
    const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
    if (Array.isArray(parsed)) rows = parsed;
  } catch {
    rows = [];
  }
  const byId = new Map(rows.map((r) => [r.externalId, r]));
  return batch.map((t) => {
    const r = byId.get(t.externalId);
    const status = (VALID as string[]).includes(r?.status ?? "") ? (r!.status as Readiness) : "NEEDS_SPEC";
    return { externalId: t.externalId, status, reason: r?.reason ?? "unclassified" };
  });
}

const SYSTEM =
  "You triage tickets for autonomous coding agents. For EACH ticket decide: " +
  "READY (clear goal + acceptance criteria + scoped for one agent), NEEDS_SPEC " +
  "(too vague/large; reason should suggest a split), or BLOCKED (depends on " +
  'unfinished work or a human decision). Reply as a strict JSON array: ' +
  '[{"externalId":"","status":"READY|NEEDS_SPEC|BLOCKED","reason":""}]. No prose.';

// Batched network call. One LLM request per readinessBatch tickets.
export async function classifyReadiness(tasks: ReadyTask[]): Promise<Verdict[]> {
  const size = agentModeConfig().readinessBatch;
  const out: Verdict[] = [];
  for (let i = 0; i < tasks.length; i += size) {
    const batch = tasks.slice(i, i + size);
    const prompt = JSON.stringify(batch.map((t) => ({ externalId: t.externalId, title: t.title, description: t.description ?? "" })));
    let raw: string;
    try {
      raw = await complete({ system: SYSTEM, prompt, maxTokens: 1500 });
    } catch {
      raw = ""; // parseReadiness will default the batch to NEEDS_SPEC
    }
    out.push(...parseReadiness(raw, batch));
  }
  return out;
}
