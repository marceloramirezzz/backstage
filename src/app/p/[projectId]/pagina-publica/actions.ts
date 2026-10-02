"use server";

import { refresh } from "next/cache";
import { getPool } from "@/db/pool.ts";
import { text } from "@/lib/form.ts";
import { errorMessage, type ErrorMessages } from "@/lib/error-message.ts";
import { requireUser } from "@/lib/session.ts";
import { CONTACT_PLATFORMS, type ContactPlatform } from "@/lib/contact-link.ts";
import { saveLandingAlbum, saveLandingContacts, saveLandingSettings } from "@/services/landing-page.ts";

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

export interface ListActionState {
  error?: string;
  // Bumped on every success, so the form knows it saved.
  done: number;
}

const LIST_MESSAGES: ErrorMessages = {
  forbidden: "Solo los admins editan la página pública.",
  not_found: "Esta banda ya no existe.",
  invalid_input: "Revisá los datos: cada foto necesita una dirección https y cada contacto un valor válido.",
};

const all = (form: FormData, name: string) => form.getAll(name).map(String);

// The photos in the order the form lists them. Rows with no address are
// skipped.
export async function saveAlbum(prev: ListActionState, form: FormData): Promise<ListActionState> {
  const user = await requireUser();
  const captions = all(form, "caption");
  const photos = all(form, "url")
    .map((url, i) => ({ url, caption: captions[i] ?? "" }))
    .filter((p) => p.url.trim());
  try {
    await saveLandingAlbum(getPool(), user, text(form, "projectId"), photos);
    refresh();
    return { done: prev.done + 1 };
  } catch (err) {
    return { ...prev, error: errorMessage(err, LIST_MESSAGES) };
  }
}

// The contact links in the order the form lists them. Rows with no value are
// skipped.
export async function saveContacts(prev: ListActionState, form: FormData): Promise<ListActionState> {
  const user = await requireUser();
  const platforms = all(form, "platform");
  const labels = all(form, "label");
  const contacts = all(form, "value")
    .map((value, i) => ({
      platform: platforms[i] as ContactPlatform,
      label: labels[i] ?? "",
      value,
    }))
    .filter((c) => c.value.trim());
  if (contacts.some((c) => !CONTACT_PLATFORMS.includes(c.platform))) {
    return { ...prev, error: LIST_MESSAGES.invalid_input };
  }
  try {
    await saveLandingContacts(getPool(), user, text(form, "projectId"), contacts);
    refresh();
    return { done: prev.done + 1 };
  } catch (err) {
    return { ...prev, error: errorMessage(err, LIST_MESSAGES) };
  }
}
