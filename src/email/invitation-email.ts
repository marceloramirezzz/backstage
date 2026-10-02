import type { EmailMessage, Mailer } from "./mailer.ts";

// The email that carries an Invitación's link. `token` is the one returned
// when it was sent or resent; only the latest link works.
export function invitationEmail(
  mailer: Mailer,
  invite: { email: string; projectName: string; roleName: string; invitedByName: string },
  token: string,
): EmailMessage {
  const link = new URL(`/invitacion?token=${token}`, mailer.appUrl);
  return {
    to: invite.email,
    subject: `${invite.invitedByName} te invitó a ${invite.projectName} en Backstage`,
    body: `Hola:

${invite.invitedByName} te invitó a sumarte a ${invite.projectName} en Backstage con el rol ${invite.roleName}.

Para aceptar la invitación, abrí este enlace con el correo ${invite.email}:

${link}

El enlace vence en 7 días.

Si no esperabas esta invitación, ignorá este correo.
`,
  };
}
