import { db } from "../src/db";

// Seed one program + team so the dashboard and routines have something to run
// against before the integrations are wired. Expand into the M2/M4 fixtures
// (a PRD to plan, a seeded regression where risk must fire before a slip).
async function main() {
  const program = await db.program.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default", name: "Demo Program" },
  });
  await db.team.upsert({
    where: { id: "team-core" },
    update: {},
    create: { id: "team-core", programId: program.id, name: "Core" },
  });
  console.log("Seeded program:", program.name);
}

main().finally(() => db.$disconnect());
