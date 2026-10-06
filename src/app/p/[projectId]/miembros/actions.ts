"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { getPool } from "@/db/pool.ts";
import { invitationEmail } from "@/email/invitation-email.ts";
import { getMailer } from "@/email/app-mailer.ts";
import { errorMessage, type ErrorMessages } from "@/lib/error-message.ts";
import { text } from "@/lib/form.ts";
import { roleLabel } from "@/lib/role-label.ts";
import { requireUser } from "@/lib/session.ts";
import type { User } from "@/services/accounts.ts";
import { ServiceError } from "@/services/errors.ts";
import {
  resendInvitation,
  revokeInvitation,
  sendInvitations,
  type SentInvitation,
} from "@/services/invitations.ts";
import { deleteProject, leaveProject, removeMember, transferOwnership } from "@/services/members.ts";
import { ROLE_TOGGLES, type RoleToggles } from "@/services/permissions.ts";
import { MAX_PUBLIC_BIO_LENGTH, MAX_PUBLIC_NAME_LENGTH, saveMyPublicProfile } from "@/services/landing-page.ts";
import { getProject } from "@/services/projects.ts";
import { changeMemberRole, createRole, deleteRole, listRoles, updateRole, type Role } from "@/services/roles.ts";

export interface ActionResult {
  error?: string;
}

export interface FormState extends ActionResult {
  // Bumped on every success, so the form knows to move on.
  done: number;
  // The Invitaciones were created but some emails failed: the form must not
  // be resubmitted, since the addresses are already invited.
  created?: boolean;
}

const ADMINS_ONLY = "Solo los admins pueden hacer esto.";
const NO_MEMBER = "Este miembro ya no está en la banda.";

const MEMBER_MESSAGES: ErrorMessages = {
  forbidden: "Tu rol no puede quitar a este miembro. Solo un Admin quita a otro Admin.",
  owner_protected: "El Dueño no se puede quitar: primero tiene que transferir la banda.",
  not_found: NO_MEMBER,
};

export async function removeMemberAction(projectId: string, userId: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await removeMember(getPool(), user, projectId, userId);
  } catch (err) {
    // Already gone is what was asked for.
    if (!(err instanceof ServiceError && err.code === "not_found")) {
      return { error: errorMessage(err, MEMBER_MESSAGES) };
    }
  }
  refresh();
  return {};
}

export async function changeRoleAction(
  projectId: string,
  userId: string,
  roleId: string,
): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await changeMemberRole(getPool(), user, projectId, userId, roleId);
  } catch (err) {
    return {
      error: errorMessage(err, {
        forbidden: ADMINS_ONLY,
        owner_protected: "El Dueño siempre es Admin.",
        not_found: "Ese miembro o ese rol ya no existe.",
      }),
    };
  }
  refresh();
  return {};
}

// The acting Member leaves and goes back to their Bandas.
export async function leaveAction(prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  try {
    await leaveProject(getPool(), user, text(form, "projectId"));
  } catch (err) {
    // Already out is what was asked for.
    if (!(err instanceof ServiceError && err.code === "not_found")) {
      return {
        ...prev,
        error: errorMessage(err, {
          owner_protected: "Sos el Dueño: transferí la banda a otro Admin antes de salir.",
        }),
      };
    }
  }
  redirect("/");
}

export async function transferAction(prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  try {
    await transferOwnership(getPool(), user, text(form, "projectId"), text(form, "userId"));
  } catch (err) {
    return {
      ...prev,
      error: errorMessage(err, {
        forbidden: "Solo el Dueño transfiere la banda.",
        invalid_input: "La banda solo se transfiere a otro Admin.",
        not_found: NO_MEMBER,
      }),
    };
  }
  refresh();
  return { done: prev.done + 1 };
}

export async function deleteProjectAction(prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  try {
    await deleteProject(getPool(), user, text(form, "projectId"), text(form, "name"));
  } catch (err) {
    // Already gone is what was asked for.
    if (!(err instanceof ServiceError && err.code === "not_found")) {
      return {
        ...prev,
        error: errorMessage(err, {
          forbidden: "Solo el Dueño elimina la banda.",
          invalid_input: "Escribí el nombre de la banda tal cual para eliminarla.",
        }),
      };
    }
  }
  redirect("/");
}

const INVITE_MESSAGES: ErrorMessages = {
  forbidden: ADMINS_ONLY,
  not_found: "Ese rol ya no existe.",
  already_member: "Alguien de esa lista ya es miembro de la banda.",
  already_invited: "Alguien de esa lista ya tiene una invitación pendiente.",
  invalid_input: "Revisá los correos: cada uno tiene que ser válido y no repetirse.",
};

const roleName = (role: Role | undefined) => (role ? roleLabel(role.kind, role.name) : "");

// Emails each Invitación's link. One that fails to send stays open, so the
// Admin can resend it from the list.
async function mailInvitations(user: User, projectId: string, sent: SentInvitation[]) {
  const pool = getPool();
  const [project, roles] = await Promise.all([
    getProject(pool, user, projectId),
    listRoles(pool, user, projectId),
  ]);
  const mailer = getMailer();
  const failed: string[] = [];
  for (const { invitation, token } of sent) {
    try {
      await mailer.send(
        invitationEmail(
          mailer,
          {
            email: invitation.email,
            projectName: project.name,
            roleName: roleName(roles.find((r) => r.id === invitation.roleId)),
            invitedByName: user.displayName,
          },
          token,
        ),
      );
    } catch (err) {
      console.error(`Could not email an Invitation to ${invitation.email}`, err);
      failed.push(invitation.email);
    }
  }
  return failed;
}

const SEND_FAILED = (emails: string[]) =>
  `Creamos la invitación pero no pudimos enviar el correo a ${emails.join(", ")}. Reenviala desde la lista.`;

// Invites each row's email with its Rol and emails the links.
export async function sendInvitationsAction(prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const projectId = text(form, "projectId");
  const roleIds = form.getAll("roleId").map(String);
  const invites = form
    .getAll("email")
    .map((email, i) => ({ email: String(email), roleId: roleIds[i] ?? "" }))
    .filter((invite) => invite.email.trim());
  let failed: string[];
  try {
    const sent = await sendInvitations(getPool(), user, projectId, invites);
    failed = await mailInvitations(user, projectId, sent);
  } catch (err) {
    return { ...prev, error: errorMessage(err, INVITE_MESSAGES) };
  }
  refresh();
  if (failed.length) return { error: SEND_FAILED(failed), done: prev.done, created: true };
  return { done: prev.done + 1 };
}

export async function resendInvitationAction(
  projectId: string,
  invitationId: string,
): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const sent = await resendInvitation(getPool(), user, projectId, invitationId);
    const failed = await mailInvitations(user, projectId, [sent]);
    if (failed.length) return { error: SEND_FAILED(failed) };
  } catch (err) {
    return {
      error: errorMessage(err, {
        forbidden: ADMINS_ONLY,
        not_found: "Esta invitación ya no está abierta. Si se canceló, podés invitar de nuevo.",
      }),
    };
  }
  refresh();
  return {};
}

export async function revokeInvitationAction(
  projectId: string,
  invitationId: string,
): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await revokeInvitation(getPool(), user, projectId, invitationId);
  } catch (err) {
    // Already closed is what was asked for.
    if (!(err instanceof ServiceError && err.code === "not_found")) {
      return { error: errorMessage(err, { forbidden: ADMINS_ONLY }) };
    }
  }
  refresh();
  return {};
}

const ROLE_MESSAGES: ErrorMessages = {
  forbidden: ADMINS_ONLY,
  not_found: "Este rol ya no existe.",
  invalid_input: "Poné un nombre para el rol.",
  name_taken: "Ya hay un rol con ese nombre.",
  built_in_role: "Admin y Miembro no se pueden cambiar.",
};

export interface RoleFormState extends FormState {
  // The Role just created, so the form can select it.
  createdId?: string;
}

// Creates a custom Rol, or saves `roleId`'s name and permissions.
export async function saveRoleAction(
  prev: RoleFormState,
  form: FormData,
): Promise<RoleFormState> {
  const user = await requireUser();
  const projectId = text(form, "projectId");
  const roleId = text(form, "roleId");
  const input = {
    name: text(form, "name"),
    toggles: Object.fromEntries(ROLE_TOGGLES.map((t) => [t, form.get(t) === "on"])) as RoleToggles,
  };
  let createdId: string | undefined;
  try {
    if (roleId) await updateRole(getPool(), user, projectId, roleId, input);
    else createdId = (await createRole(getPool(), user, projectId, input)).id;
  } catch (err) {
    return { ...prev, createdId: undefined, error: errorMessage(err, ROLE_MESSAGES) };
  }
  refresh();
  return { done: prev.done + 1, createdId };
}

export async function deleteRoleAction(projectId: string, roleId: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await deleteRole(getPool(), user, projectId, roleId);
  } catch (err) {
    // Already gone is what was asked for.
    if (!(err instanceof ServiceError && err.code === "not_found")) {
      return {
        error: errorMessage(err, {
          ...ROLE_MESSAGES,
          role_in_use:
            "Mientras haya miembros o invitaciones pendientes con este rol no se puede eliminar. Cambiales el rol primero.",
        }),
      };
    }
  }
  refresh();
  return {};
}

const PUBLIC_PROFILE_MESSAGES: ErrorMessages = {
  not_found: "Esta banda ya no existe.",
  invalid_input: `Para aparecer en la página necesitás un nombre; el nombre admite hasta ${MAX_PUBLIC_NAME_LENGTH} caracteres y la bio ${MAX_PUBLIC_BIO_LENGTH}.`,
};

// The acting Member's own entry in the Landing page's About section.
export async function savePublicProfile(prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  try {
    await saveMyPublicProfile(getPool(), user, text(form, "projectId"), {
      publicName: text(form, "publicName"),
      publicBio: text(form, "publicBio"),
      showOnAbout: form.get("showOnAbout") === "on",
    });
    refresh();
    return { done: prev.done + 1 };
  } catch (err) {
    return { ...prev, error: errorMessage(err, PUBLIC_PROFILE_MESSAGES) };
  }
}
