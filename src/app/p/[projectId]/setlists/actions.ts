"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { getPool } from "@/db/pool.ts";
import { errorMessage, type ErrorMessages } from "@/lib/error-message.ts";
import { requireUser } from "@/lib/session.ts";
import { ServiceError } from "@/services/errors.ts";
import {
  createSetlist,
  deleteSetlist,
  duplicateSetlist,
  updateSetlist,
  type SetlistItemRef,
} from "@/services/setlists.ts";

// Creating, duplicating and deleting open another page when they work, so
// all they report back is what went wrong.
export interface SetlistActionState {
  error?: string;
}

export interface SetlistFormState extends SetlistActionState {
  // Bumped on every successful save.
  saved: number;
}

const FORBIDDEN: ErrorMessages = { forbidden: "Tu rol no puede editar setlists." };
const GONE: ErrorMessages = { not_found: "Esta setlist ya no existe." };

const setlistsPath = (projectId: string, setlistId?: string) =>
  `/p/${projectId}/setlists${setlistId ? `?setlist=${setlistId}` : ""}`;

// Adds an empty Setlist and opens it.
export async function addSetlist(
  _prev: SetlistActionState,
  form: FormData,
): Promise<SetlistActionState> {
  const user = await requireUser();
  const projectId = String(form.get("projectId") ?? "");
  let setlistId: string;
  try {
    ({ id: setlistId } = await createSetlist(getPool(), user, projectId, {
      name: String(form.get("name") ?? ""),
      category: String(form.get("category") ?? ""),
      items: [],
    }));
  } catch (err) {
    return {
      error: errorMessage(err, { ...FORBIDDEN, invalid_input: "Poné el nombre de la setlist." }),
    };
  }
  redirect(setlistsPath(projectId, setlistId));
}

// Saves a Setlist's name, category and items. The items come as repeated
// `items`, each `song:<id>` or `selection:<id>`, in playing order.
export async function saveSetlist(
  prev: SetlistFormState,
  form: FormData,
): Promise<SetlistFormState> {
  const user = await requireUser();
  const projectId = String(form.get("projectId") ?? "");
  const items = form.getAll("items").map((value): SetlistItemRef => {
    const [kind, id = ""] = String(value).split(":");
    return { kind: kind as SetlistItemRef["kind"], id };
  });
  try {
    await updateSetlist(getPool(), user, projectId, String(form.get("setlistId") ?? ""), {
      name: String(form.get("name") ?? ""),
      category: String(form.get("category") ?? ""),
      items,
    });
  } catch (err) {
    const error = errorMessage(err, {
      ...FORBIDDEN,
      ...GONE,
      invalid_input: "Revisá el nombre y que cada canción y enganchado siga en el repertorio.",
    });
    return { ...prev, error };
  }
  refresh();
  return { saved: prev.saved + 1 };
}

// Copies the saved Setlist under a new name and opens the copy.
export async function copySetlist(
  _prev: SetlistActionState,
  form: FormData,
): Promise<SetlistActionState> {
  const user = await requireUser();
  const projectId = String(form.get("projectId") ?? "");
  let setlistId: string;
  try {
    ({ id: setlistId } = await duplicateSetlist(
      getPool(),
      user,
      projectId,
      String(form.get("setlistId") ?? ""),
      String(form.get("name") ?? ""),
    ));
  } catch (err) {
    return {
      error: errorMessage(err, {
        ...FORBIDDEN,
        ...GONE,
        invalid_input: "Poné el nombre de la copia.",
      }),
    };
  }
  redirect(setlistsPath(projectId, setlistId));
}

export async function removeSetlist(
  _prev: SetlistActionState,
  form: FormData,
): Promise<SetlistActionState> {
  const user = await requireUser();
  const projectId = String(form.get("projectId") ?? "");
  try {
    await deleteSetlist(getPool(), user, projectId, String(form.get("setlistId") ?? ""));
  } catch (err) {
    // Already gone is what was asked for.
    if (!(err instanceof ServiceError && err.code === "not_found")) {
      return { error: errorMessage(err, FORBIDDEN) };
    }
  }
  redirect(setlistsPath(projectId));
}
