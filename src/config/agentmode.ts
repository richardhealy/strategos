export interface AgentModeConfig { label: string; readinessBatch: number }

function int(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export function parseAgentModeConfig(env: Record<string, string | undefined>): AgentModeConfig {
  return {
    label: env.STRATEGOS_AGENT_LABEL?.trim() || "agent",
    readinessBatch: int(env.STRATEGOS_READINESS_BATCH, 20),
  };
}

export function agentModeConfig(): AgentModeConfig {
  return parseAgentModeConfig(process.env);
}
