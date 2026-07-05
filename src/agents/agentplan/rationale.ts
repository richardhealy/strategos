import { complete } from "@/llm/client";

export async function dispatchRationale(initiativeTitle: string, waveCount: number, readyCount: number): Promise<string> {
  try {
    return await complete({
      system: "You are a technical program manager. In 1-2 sentences, explain this agent dispatch plan. No preamble.",
      prompt: `Project "${initiativeTitle}": ${readyCount} ready tickets across ${waveCount} dependency waves.`,
      maxTokens: 200,
    });
  } catch {
    return `${readyCount} ready tickets across ${waveCount} precedence wave(s).`;
  }
}
