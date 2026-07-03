export interface LinearConfig {
  apiKey: string;
  webhookSecret: string | null;
  teamKeys: string[];
}

export function parseLinearConfig(env: Record<string, string | undefined>): LinearConfig {
  const apiKey = env.LINEAR_API_KEY;
  if (!apiKey) throw new Error("LINEAR_API_KEY is not set — cannot sync Linear.");
  const teamKeys = (env.LINEAR_TEAM_KEYS ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k.length > 0);
  return { apiKey, webhookSecret: env.LINEAR_WEBHOOK_SECRET ?? null, teamKeys };
}

export function linearConfig(): LinearConfig {
  return parseLinearConfig(process.env);
}
