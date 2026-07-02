import type { log } from "@/logger";

// Shared context every agent receives. Agents READ the model and PROPOSE
// actions; they never write to the outside world directly.
export interface AgentContext {
  programId: string;
  logger: ReturnType<typeof log.child>;
}

export interface Agent<TInput, TOutput> {
  readonly name: string;
  run(ctx: AgentContext, input: TInput): Promise<TOutput>;
}
