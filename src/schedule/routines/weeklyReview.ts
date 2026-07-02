import { inngest } from "@/schedule/inngest";
import { communicatorAgent } from "@/agents/communicator";
import { hitl } from "@/hitl/gate";
import { log } from "@/logger";

// 3. Weekly program review: health report, draft exec update (HITL before
//    sending), escalate critical risks.
export const weeklyReview = inngest.createFunction(
  { id: "weekly-review" },
  { cron: "0 8 * * 5" },
  async ({ step }) => {
    const ctx = { programId: "default", logger: log.child({ run: "weekly-review" }) };
    const draft = await step.run("draft-exec-update", () =>
      communicatorAgent.run(ctx, { channel: "exec-update", context: "TODO: program health snapshot" }),
    );

    if (draft.gradePass) {
      await step.run("file-hitl-proposal", () =>
        hitl.propose({
          kind: "COMMUNICATION",
          summary: "Weekly executive status update",
          createdBy: "communicator",
          payload: { channel: "exec-update", body: draft.body },
        }),
      );
    }
    return { drafted: true, gradePass: draft.gradePass };
  },
);
