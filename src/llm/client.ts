import Anthropic from "@anthropic-ai/sdk";
import { config } from "@/config";

// Central LLM entry point. Routing spend through abacus and resilience through
// bulwark (AI Gateway) is a config-time concern via AI_GATEWAY_URL.
const client = new Anthropic({
  apiKey: config.ANTHROPIC_API_KEY,
  ...(config.AI_GATEWAY_URL ? { baseURL: config.AI_GATEWAY_URL } : {}),
});

export async function complete(input: {
  system: string;
  prompt: string;
  maxTokens?: number;
}): Promise<string> {
  const res = await client.messages.create({
    model: config.STRATEGOS_MODEL,
    max_tokens: input.maxTokens ?? 2000,
    system: input.system,
    messages: [{ role: "user", content: input.prompt }],
  });
  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}
