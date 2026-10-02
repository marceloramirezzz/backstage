import type { GoogleFailure } from "@/services/google-sign-in.ts";

// Shown on the sign-in page, which the failed flow returns to as `?google=<reason>`.
const MESSAGES: Record<GoogleFailure, string> = {
  cancelled: "Cancelaste el ingreso con Google. Podés intentarlo de nuevo o ingresar con tu correo.",
  failed: "No pudimos ingresar con Google. Probá de nuevo en un momento.",
  unverified: "Google no verificó tu correo, así que no podemos usarlo para ingresar.",
  taken: "Este correo ya está asociado a otra cuenta de Google.",
};

export function googleErrorMessage(reason: string | undefined): string | undefined {
  return reason && Object.hasOwn(MESSAGES, reason) ? MESSAGES[reason as GoogleFailure] : undefined;
}

// The sign-in page a failed flow returns to, keeping the page to return to
// after a later success.
export function googleFailurePath(reason: GoogleFailure, returnPath: string | null): string {
  const query = new URLSearchParams();
  if (returnPath) query.set("volver", returnPath);
  query.set("google", reason);
  return `/ingresar?${query}`;
}
