import { z } from "zod";

// A blank env var (e.g. `AI_GATEWAY_URL=` from a pasted .env) is an empty string,
// not undefined — so `.optional()` alone won't skip it and `.url()` would reject
// it. Treat "" as unset for optional fields.
const emptyToUndefined = (v: unknown) => (v === "" ? undefined : v);

// Fail fast at boot if the environment is not what the code assumes.
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  ANTHROPIC_API_KEY: z.string().min(1),
  STRATEGOS_MODEL: z.string().default("claude-sonnet-4-6"),
  AI_GATEWAY_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  INNGEST_EVENT_KEY: z.string().optional(),
  INNGEST_SIGNING_KEY: z.string().optional(),
});

export type Config = z.infer<typeof schema>;

export const config: Config = schema.parse(process.env);
