"use server";

import { redirect } from "next/navigation";
import { getPool } from "@/db/pool.ts";
import { requireUser } from "@/lib/session.ts";
import { ServiceError } from "@/services/errors.ts";
import { acceptInvitation } from "@/services/invitations.ts";
import { createProject } from "@/services/projects.ts";

export interface CreateProjectState {
  name: string;
  error?: string;
}

// Creates a Project and lands its new Owner in it.
export async function createProjectAndEnter(
  _prev: CreateProjectState,
  form: FormData,
): Promise<CreateProjectState> {
  const user = await requireUser();
  const name = String(form.get("name") ?? "");
  let projectId: string;
  try {
    ({ id: projectId } = await createProject(getPool(), user, { name }));
  } catch (err) {
    if (err instanceof ServiceError && err.code === "invalid_input") {
      return { name, error: "Poné el nombre de tu banda." };
    }
    if (err instanceof ServiceError && err.code === "email_not_verified") {
      return { name, error: "Verificá tu correo para crear una banda." };
    }
    throw err;
  }
  redirect(`/p/${projectId}`);
}

export interface AcceptInvitationState {
  error?: string;
}

const ACCEPT_ERRORS: Partial<Record<ServiceError["code"], string>> = {
  email_not_verified: "Verificá tu correo para aceptar la invitación.",
  forbidden: "Esta invitación es para otro correo.",
  invitation_expired: "Esta invitación venció. Pedile una nueva a un Admin de la banda.",
  not_found: "Esta invitación ya no está disponible. Pedile una nueva a un Admin de la banda.",
};

// Accepts an Invitation and lands the new Member in its Project. The form
// carries the Project's id too, so someone who joined it meanwhile through
// another Invitation still lands there.
export async function acceptInvitationAndEnter(
  _prev: AcceptInvitationState,
  form: FormData,
): Promise<AcceptInvitationState> {
  const user = await requireUser();
  const projectId = String(form.get("projectId") ?? "");
  try {
    await acceptInvitation(getPool(), user, String(form.get("invitationId") ?? ""));
  } catch (err) {
    if (!(err instanceof ServiceError)) throw err;
    if (err.code !== "already_member") {
      const error = ACCEPT_ERRORS[err.code];
      if (error) return { error };
      throw err;
    }
  }
  redirect(`/p/${projectId}`);
}
