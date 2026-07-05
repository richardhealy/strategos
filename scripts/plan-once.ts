// scripts/plan-once.ts
// One-shot planning: run the sprint planner (HUMAN projects) and the agent
// planner (each AI project) now instead of waiting for the Monday cron. Emits
// HITL proposals (no Linear writes) and prints the result.
//
//   DATABASE_URL='<neon-url>' npm run db:plan
import "dotenv/config";
import { programModel } from "../src/state/model/repository";
import { runPlanning } from "../src/agents/planRouter";
import { log } from "../src/logger";

async function main() {
  const programId = await programModel.primaryProgramId();
  if (!programId) {
    console.error("No program found — run a sync first: npm run db:sync -- LINEAR");
    process.exit(1);
  }
  const result = await runPlanning(programId, log.child({ run: "plan-once" }));
  console.log(JSON.stringify(result, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
