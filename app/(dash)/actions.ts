"use server";

import { revalidatePath } from "next/cache";
import { hitl } from "@/hitl/gate";
import { registerDemoEffects } from "@/hitl/effects";

export async function approveProposal(formData: FormData): Promise<void> {
  registerDemoEffects();
  const id = String(formData.get("id"));
  await hitl.decide(id, true, "dashboard-user");
  await hitl.apply(id); // moves APPROVED -> APPLIED and writes the audit trail
  revalidatePath("/");
  revalidatePath("/audit");
}

export async function rejectProposal(formData: FormData): Promise<void> {
  const id = String(formData.get("id"));
  await hitl.decide(id, false, "dashboard-user", "rejected from dashboard");
  revalidatePath("/");
}
