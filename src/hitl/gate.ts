import type { ProposalKind } from "@prisma/client";
import { db } from "@/db";
import { recordAction } from "@/state/versioned/provenance";
import type { Effect, ProposeInput } from "@/hitl/types";
import { log } from "@/logger";

// The HITL gate. Design invariant: strategos never acts on the outside world
// except by (1) proposing, (2) a human approving, (3) applying here. There is
// no other code path that sends comms or writes tickets.
export class HitlGate {
  private readonly effects = new Map<ProposalKind, Effect>();
  private readonly logger = log.child({ component: "hitl" });

  register(kind: ProposalKind, effect: Effect): void {
    this.effects.set(kind, effect);
  }

  async propose(input: ProposeInput): Promise<string> {
    const proposal = await db.hitlProposal.create({
      data: {
        kind: input.kind,
        summary: input.summary,
        createdBy: input.createdBy,
        payload: input.payload as object,
        state: "PENDING",
      },
    });
    await recordAction({ actor: input.createdBy, action: "propose", proposalId: proposal.id, detail: { kind: input.kind } });
    return proposal.id;
  }

  async decide(proposalId: string, approve: boolean, decidedBy: string, reason?: string): Promise<void> {
    await db.hitlProposal.update({
      where: { id: proposalId },
      data: {
        state: approve ? "APPROVED" : "REJECTED",
        decidedAt: new Date(),
        decidedBy,
        reason,
      },
    });
  }

  // Perform the external action. Refuses anything not explicitly APPROVED.
  async apply(proposalId: string): Promise<{ ref?: string }> {
    const proposal = await db.hitlProposal.findUniqueOrThrow({ where: { id: proposalId } });

    if (proposal.state !== "APPROVED") {
      // Hard stop. This is the line the adversarial test exercises.
      this.logger.warn("blocked apply on unapproved proposal", { proposalId, state: proposal.state });
      throw new Error(`HITL gate: cannot apply proposal in state ${proposal.state}`);
    }

    const effect = this.effects.get(proposal.kind);
    if (!effect) throw new Error(`HITL gate: no effect registered for ${proposal.kind}`);

    try {
      const result = await effect(proposal.payload);
      await db.hitlProposal.update({ where: { id: proposalId }, data: { state: "APPLIED", appliedAt: new Date() } });
      await recordAction({ actor: "hitl", action: "apply", proposalId, detail: { ref: result.ref } });
      return result;
    } catch (err) {
      await db.hitlProposal.update({ where: { id: proposalId }, data: { state: "FAILED" } });
      await recordAction({ actor: "hitl", action: "apply-failed", proposalId, detail: { err: String(err) } });
      throw err;
    }
  }
}

export const hitl = new HitlGate();
