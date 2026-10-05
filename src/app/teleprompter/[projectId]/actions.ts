"use server";

import { refresh } from "next/cache";
import { getPool } from "@/db/pool.ts";
import { requireUser } from "@/lib/session.ts";
import { ServiceError } from "@/services/errors.ts";
import { MAX_LYRICS_LENGTH, saveLyrics } from "@/services/lyrics.ts";

export interface LyricsFormState {
  error?: string;
  // Bumped on every successful save, so the editor knows to close.
  saved: number;
}

const LYRICS_ERRORS: Partial<Record<ServiceError["code"], string>> = {
  invalid_input: `La letra puede tener hasta ${MAX_LYRICS_LENGTH.toLocaleString("es")} caracteres.`,
  forbidden: "Tu rol no puede editar el repertorio.",
  not_found: "Esto ya no está en el repertorio.",
};

// Replaces the lyrics of a Canción or an Enganchado.
export async function saveLyricsAction(
  prev: LyricsFormState,
  form: FormData,
): Promise<LyricsFormState> {
  const user = await requireUser();
  const projectId = String(form.get("projectId") ?? "");
  const kind = form.get("kind") === "selection" ? "selection" : "song";
  try {
    await saveLyrics(
      getPool(),
      user,
      projectId,
      { kind, id: String(form.get("id") ?? "") },
      String(form.get("lyrics") ?? ""),
    );
  } catch (err) {
    const error = err instanceof ServiceError && LYRICS_ERRORS[err.code];
    if (error) return { ...prev, error };
    throw err;
  }
  refresh();
  return { saved: prev.saved + 1 };
}
