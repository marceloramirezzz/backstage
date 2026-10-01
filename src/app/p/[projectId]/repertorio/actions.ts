"use server";

import { refresh } from "next/cache";
import { getPool } from "@/db/pool.ts";
import { requireUser } from "@/lib/session.ts";
import { ServiceError } from "@/services/errors.ts";
import { createSong, deleteSong, updateSong, type Intensity } from "@/services/songs.ts";

export interface SongFormState {
  error?: string;
  // Bumped on every successful save, so the dialog knows to close.
  saved: number;
}

const SONG_ERRORS: Partial<Record<ServiceError["code"], string>> = {
  invalid_input: "Revisá el título y la duración: una canción dura hasta 99:59.",
  forbidden: "Tu rol no puede editar el repertorio.",
  not_found: "Esta canción ya no está en el repertorio.",
};

// Adds a Canción, or edits one when the form carries its id.
export async function saveSong(prev: SongFormState, form: FormData): Promise<SongFormState> {
  const user = await requireUser();
  const projectId = String(form.get("projectId") ?? "");
  const songId = String(form.get("songId") ?? "");
  const durationSeconds = clockSeconds(form.get("minutes"), form.get("seconds"));
  if (durationSeconds === null) {
    return { ...prev, error: "Poné la duración en minutos y segundos (0 a 59)." };
  }
  const input = {
    name: String(form.get("name") ?? ""),
    key: String(form.get("key") ?? ""),
    durationSeconds,
    intensity: String(form.get("intensity") ?? "") as Intensity,
  };
  try {
    if (songId) await updateSong(getPool(), user, projectId, songId, input);
    else await createSong(getPool(), user, projectId, input);
  } catch (err) {
    const error = err instanceof ServiceError && SONG_ERRORS[err.code];
    if (error) return { ...prev, error };
    throw err;
  }
  refresh();
  return { saved: prev.saved + 1 };
}

export interface DeleteSongState {
  error?: string;
  // Bumped on every successful delete, so the dialog knows to close.
  deleted: number;
}

const DELETE_ERRORS: Partial<Record<ServiceError["code"], string>> = {
  song_in_use:
    "Esta canción está en un Enganchado o una Setlist. Sacala de ahí antes de eliminarla.",
  forbidden: "Tu rol no puede editar el repertorio.",
};

export async function removeSong(prev: DeleteSongState, form: FormData): Promise<DeleteSongState> {
  const user = await requireUser();
  const projectId = String(form.get("projectId") ?? "");
  try {
    await deleteSong(getPool(), user, projectId, String(form.get("songId") ?? ""));
  } catch (err) {
    // Already gone is what was asked for.
    if (!(err instanceof ServiceError && err.code === "not_found")) {
      const error = err instanceof ServiceError && DELETE_ERRORS[err.code];
      if (error) return { ...prev, error };
      throw err;
    }
  }
  refresh();
  return { deleted: prev.deleted + 1 };
}

// Whole seconds from the form's minutes and seconds, or null when either
// isn't a whole number or the seconds aren't 0–59. Blank minutes count as 0.
// The service decides how long a Song may be.
function clockSeconds(minutes: FormDataEntryValue | null, seconds: FormDataEntryValue | null) {
  const m = Number(String(minutes ?? "").trim() || "0");
  const s = Number(String(seconds ?? "").trim() || "0");
  if (!Number.isInteger(m) || !Number.isInteger(s) || m < 0 || s < 0 || s > 59) return null;
  return m * 60 + s;
}
