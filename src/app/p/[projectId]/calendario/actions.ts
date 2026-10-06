"use server";

import { refresh } from "next/cache";
import { getPool } from "@/db/pool.ts";
import { errorMessage } from "@/lib/error-message.ts";
import { text } from "@/lib/form.ts";
import { requireUser } from "@/lib/session.ts";
import { regenerateCalendarFeedToken } from "@/services/calendar-feed.ts";

export interface FeedFormState {
  error?: string;
}

// Gives the feed a new address; the old one stops working.
export async function regenerateFeed(_prev: FeedFormState, form: FormData): Promise<FeedFormState> {
  const user = await requireUser();
  try {
    await regenerateCalendarFeedToken(getPool(), user, text(form, "projectId"));
  } catch (err) {
    return { error: errorMessage(err, { forbidden: "Solo un Admin puede cambiar el enlace." }) };
  }
  refresh();
  return {};
}
