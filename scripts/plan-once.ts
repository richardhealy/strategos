// scripts/plan-once.ts
// One-shot sprint planner: run the sprint agent now instead of waiting for the
// Monday cron. Emits a SPRINT_PLAN proposal (HITL — no Linear writes) from the
// managed-project backlog, then prints it.
//
// Prereq: label the projects you want planned with STRATEGOS_SPRINT_LABEL in
// Linear and sync first (npm run db:sync -- LINEAR) — otherwise there are no
// managed candidates and nothing is proposed.
//
//   DATABASE_URL='<neon-url>' npm run db:plan
import "dotenv/config";
import { programModel } from "../src/state/model/repository";
import { sprintAgent } from "../src/agents/sprint";
import { log } from "../src/logger";

async function main() {
  const programId = await programModel.primaryProgramId();
  if (!programId) {
    console.error("No program found — run a sync first: npm run db:sync -- LINEAR");
    process.exit(1);
  }
  const result = await sprintAgent.run({ programId, logger: log.child({ run: "plan-once" }) });
  const sprint = await programModel.currentSprint();
  console.log(JSON.stringify({ result, sprint }, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
