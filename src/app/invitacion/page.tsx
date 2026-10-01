import type { Metadata } from "next";
import Link from "next/link";
import { signOut } from "@/app/session-actions.ts";
import { AuthScreen, authCardClass } from "@/components/auth-screen.tsx";
import { AcceptInvitationForm } from "@/components/invitations/accept-invitation-form.tsx";
import { InvitationSummary } from "@/components/invitations/invitation-summary.tsx";
import { Button, buttonClass } from "@/components/ui/button.tsx";
import { VerifyEmailBanner } from "@/components/verify-email-banner.tsx";
import { getPool } from "@/db/pool.ts";
import { withReturnPath } from "@/lib/return-path.ts";
import { getCurrentUser } from "@/lib/session.ts";
import { signInPath } from "@/lib/session-cookie.ts";
import { ServiceError } from "@/services/errors.ts";
import { getInvitationByToken, type ReceivedInvitation } from "@/services/invitations.ts";

export const metadata: Metadata = { title: "Invitación · Backstage" };

const ASK_FOR_A_NEW_ONE = "Pedile una nueva a un Admin de la banda.";

// Where an Invitación's emailed link lands. Anyone can open it: a visitor
// signs in or creates an account and comes back here to accept.
export default async function InvitationPage({ searchParams }: PageProps<"/invitacion">) {
  const { token } = await searchParams;
  if (typeof token !== "string" || token === "") return <Unavailable reason="invalid_token" />;

  let invitation: ReceivedInvitation;
  try {
    invitation = await getInvitationByToken(getPool(), token);
  } catch (err) {
    if (err instanceof ServiceError && err.code in UNAVAILABLE) {
      return <Unavailable reason={err.code as keyof typeof UNAVAILABLE} />;
    }
    throw err;
  }

  const user = await getCurrentUser();
  const here = `/invitacion?token=${encodeURIComponent(token)}`;
  const title = `Te invitaron a ${invitation.projectName}`;
  const summary = (
    <div className="rounded-md bg-bg-3 p-4">
      <InvitationSummary invitation={invitation} />
    </div>
  );

  if (!user) {
    return (
      <AuthScreen
        title={title}
        intro={
          <>
            La invitación es para <b className="text-ink wrap-anywhere">{invitation.email}</b>. Ingresá o
            creá una cuenta con ese correo para aceptarla.
          </>
        }
      >
        <div className={authCardClass}>
          {summary}
          <Link
            href={withReturnPath("/crear-cuenta", here)}
            className={buttonClass({ variant: "primary", size: "lg", className: "justify-center" })}
          >
            Crear una cuenta
          </Link>
          <Link
            href={signInPath(here)}
            className={buttonClass({ size: "lg", className: "justify-center" })}
          >
            Ya tengo cuenta, ingresar
          </Link>
        </div>
      </AuthScreen>
    );
  }

  if (user.email !== invitation.email) {
    return (
      <AuthScreen
        title="Esta invitación es para otro correo"
        intro={
          <>
            Es para <b className="text-ink wrap-anywhere">{invitation.email}</b>, y ingresaste como{" "}
            <b className="text-ink wrap-anywhere">{user.email}</b>. Cerrá sesión e ingresá con ese
            correo para aceptarla.
          </>
        }
      >
        <form action={signOut} className={authCardClass}>
          {summary}
          <input type="hidden" name="volver" value={here} />
          <Button type="submit" variant="primary" size="lg" className="justify-center">
            Cerrar sesión
          </Button>
        </form>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen
      title={title}
      intro={`${invitation.invitedByName} te invitó a sumarte a la banda.`}
    >
      {!user.emailVerified && <VerifyEmailBanner email={user.email} />}
      <div className={authCardClass}>
        {summary}
        <AcceptInvitationForm
          invitationId={invitation.id}
          projectId={invitation.projectId}
          variant="primary"
          size="lg"
          disabledReason={
            user.emailVerified ? undefined : "Verificá tu correo para aceptar la invitación."
          }
        />
      </div>
    </AuthScreen>
  );
}

const UNAVAILABLE = {
  invalid_token: {
    title: "Este enlace ya no sirve",
    intro: `Si te reenviaron la invitación, usá el último enlace que te llegó. Si no, pedile una nueva a un Admin de la banda.`,
  },
  invitation_expired: {
    title: "Esta invitación venció",
    intro: `Las invitaciones duran 7 días. ${ASK_FOR_A_NEW_ONE}`,
  },
  invitation_revoked: {
    title: "Esta invitación fue cancelada",
    intro: `Un Admin de la banda la canceló. ${ASK_FOR_A_NEW_ONE}`,
  },
  invitation_accepted: {
    title: "Esta invitación ya fue aceptada",
    intro: "Ingresá con el correo al que llegó para entrar a la banda.",
  },
} satisfies Partial<Record<ServiceError["code"], { title: string; intro: string }>>;

function Unavailable({ reason }: { reason: keyof typeof UNAVAILABLE }) {
  const { title, intro } = UNAVAILABLE[reason];
  return (
    <AuthScreen title={title} intro={intro}>
      <Link href="/" className={buttonClass({ variant: "primary", size: "lg", className: "justify-center" })}>
        Ir a Backstage
      </Link>
    </AuthScreen>
  );
}
