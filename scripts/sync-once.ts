// scripts/sync-once.ts
// One-shot sync: pull real data from configured integrations into the program
// model, on demand. Same engine the daily Inngest cron runs — this just lets you
// trigger it now (e.g. to populate a fresh prod DB) without waiting for 06:00.
//
//   DATABASE_URL='<neon-url>' npm run db:sync            # all integrations
//   DATABASE_URL='<neon-url>' npm run db:sync -- LINEAR  # only the ones you name
//
// Reads integration creds (LINEAR_API_KEY, etc.) from your .env; override
// DATABASE_URL inline to point at Neon instead of your local database.
import "dotenv/config";
import type { IntegrationKind } from "@prisma/client";
import { syncAll, syncIntegration } from "../src/state/sync/syncEngine";

const ALL: IntegrationKind[] = ["LINEAR", "GITHUB", "JIRA", "GITLAB", "AZURE_DEVOPS"];

async function main() {
  const requested = process.argv.slice(2).map((s) => s.toUpperCase());
  const kinds = requested.filter((k): k is IntegrationKind => (ALL as string[]).includes(k));
  if (requested.length && !kinds.length) {
    throw new Error(`Unknown integration(s): ${requested.join(", ")}. Valid: ${ALL.join(", ")}`);
  }

  const result = kinds.length
    ? Object.fromEntries(await Promise.all(kinds.map(async (k) => [k, await syncIntegration(k)])))
    : await syncAll();

  console.log(JSON.stringify(result, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
