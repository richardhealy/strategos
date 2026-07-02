import { dailySync } from "@/schedule/routines/dailySync";
import { sprintCadence } from "@/schedule/routines/sprintCadence";
import { weeklyReview } from "@/schedule/routines/weeklyReview";
import { onWebhook } from "@/schedule/routines/onEvent";

export { inngest } from "@/schedule/inngest";
export const functions = [dailySync, sprintCadence, weeklyReview, onWebhook];
