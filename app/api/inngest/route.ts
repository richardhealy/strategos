import { serve } from "inngest/next";
import { inngest, functions } from "@/schedule";

// Durable routines are served here for the Inngest dev server / cloud.
export const { GET, POST, PUT } = serve({ client: inngest, functions });
