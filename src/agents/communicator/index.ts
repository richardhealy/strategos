import type { Agent, AgentContext } from "@/agents/types";
import { draftCommunication, type Channel } from "@/agents/communicator/drafts";
import { gradeCommunication } from "@/eval/graders";
import { recordAction } from "@/state/versioned/provenance";

export interface CommunicatorInput { channel: Channel; context: string; audience?: string }
export interface CommunicatorOutput { body: string; gradePass: boolean; gradeScore: number }

// Drafts communication, grades it with the assay-style harness, and (in M5)
// files a COMMUNICATION proposal into the HITL queue. Nothing is ever sent here.
export const communicatorAgent: Agent<CommunicatorInput, CommunicatorOutput> = {
  name: "communicator",
  async run(ctx: AgentContext, input: CommunicatorInput) {
    ctx.logger.info("drafting communication", { channel: input.channel });
    const body = await draftCommunication(input.channel, input.context);
    const grade = await gradeCommunication({ body, groundingContext: input.context });

    await recordAction({
      actor: "communicator",
      action: "draft",
      detail: { channel: input.channel, gradePass: grade.pass, gradeScore: grade.score },
    });

    // A failing draft never reaches the HITL queue (spec quality checklist).
    return { body, gradePass: grade.pass, gradeScore: grade.score };
  },
};
