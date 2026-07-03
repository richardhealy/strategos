import { LinearClient } from "@linear/sdk";
import { linearConfig } from "@/config/linear";

// One client per process; throws a clear error if the key is unset.
let client: LinearClient | null = null;
export function linearClient(): LinearClient {
  if (!client) client = new LinearClient({ apiKey: linearConfig().apiKey });
  return client;
}
