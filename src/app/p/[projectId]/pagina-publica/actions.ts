"use server";

import { refresh } from "next/cache";
import { getPool } from "@/db/pool.ts";
import { text } from "@/lib/form.ts";
import { errorMessage, type ErrorMessages } from "@/lib/error-message.ts";
import { requireUser } from "@/lib/session.ts";
import { saveLandingSettings } from "@/services/landing-page.ts";

export interface LandingActionState {
  error?: string;
  slug: string;
  // Bumped on every success, so the form knows it saved.
  done: number;
}

const MESSAGES: ErrorMessages = {
  forbidden: "Solo los admins editan la página pública.",
  not_found: "Esta banda ya no existe.",
  invalid_input: "Elegí una dirección de 3 a 40 letras minúsculas, números y guiones simples.",
  slug_taken: "Esa dirección ya está en uso.",
  slug_reserved: "Esa dirección está reservada.",
};

export async function saveLanding(prev: LandingActionState, form: FormData): Promise<LandingActionState> {
  const user = await requireUser();
  const slug = text(form, "slug");
  try {
    const saved = await saveLandingSettings(getPool(), user, text(form, "projectId"), {
      enabled: form.get("enabled") === "on",
      slug,
    });
    refresh();
    return { slug: saved.slug ?? "", done: prev.done + 1 };
  } catch (err) {
    return { ...prev, slug, error: errorMessage(err, MESSAGES) };
  }
}
