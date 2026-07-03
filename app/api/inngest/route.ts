import { serve } from "inngest/next";
import { inngest, functions } from "@/schedule";

// Steps run LLM calls that can exceed Vercel's default function timeout.
// 60s is the max on Hobby; raise on Pro if steps need longer.
export const maxDuration = 60;

// Durable routines are served here for the Inngest dev server / cloud.
export const { GET, POST, PUT } = serve({ client: inngest, functions });
