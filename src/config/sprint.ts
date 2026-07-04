export interface SprintConfig {
  label: string;
  lengthDays: number;
  seedCapacity: number;
  team: string | null;
}

function int(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export function parseSprintConfig(env: Record<string, string | undefined>): SprintConfig {
  return {
    label: env.STRATEGOS_SPRINT_LABEL?.trim() || "strategos",
    lengthDays: int(env.STRATEGOS_SPRINT_LENGTH_DAYS, 14),
    seedCapacity: int(env.STRATEGOS_SPRINT_SEED_CAPACITY, 8),
    team: env.STRATEGOS_SPRINT_TEAM?.trim() || null,
  };
}

export function sprintConfig(): SprintConfig {
  return parseSprintConfig(process.env);
}
