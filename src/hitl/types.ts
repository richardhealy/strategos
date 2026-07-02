import type { ProposalKind } from "@prisma/client";

export interface ProposeInput {
  kind: ProposalKind;
  summary: string;
  createdBy: string;   // originating agent
  payload: unknown;    // the exact external action to perform once approved
}

// The effect a proposal performs when applied. Registered per kind so the gate
// stays the single choke point for every outside action.
export type Effect = (payload: unknown) => Promise<{ ref?: string }>;
