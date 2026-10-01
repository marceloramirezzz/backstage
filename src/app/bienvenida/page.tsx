import { LogOut, Mail, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { signOut } from "@/app/session-actions.ts";
import { AcceptInvitationForm } from "@/components/invitations/accept-invitation-form.tsx";
import { InvitationSummary } from "@/components/invitations/invitation-summary.tsx";
import { Avatar, BrandLockup } from "@/components/ui/brand.tsx";
import { buttonClass, IconButton } from "@/components/ui/button.tsx";
import { iconProps } from "@/components/ui/icon-props.ts";
import { TopBar } from "@/components/ui/top-bar.tsx";
import { VerifyEmailBanner } from "@/components/verify-email-banner.tsx";
import { getPool } from "@/db/pool.ts";
import { initials } from "@/lib/initials.ts";
import { requireUser } from "@/lib/session.ts";
import { listMyInvitations } from "@/services/invitations.ts";
import { listProjects } from "@/services/projects.ts";
import { CreateProjectForm } from "./create-project-form.tsx";

export const metadata: Metadata = { title: "Bienvenida · Backstage" };

// Where a User with no Banda lands: create one, or accept an Invitación.
// Members reach it too, from the Banda switcher, for their Invitaciones.
export default async function WelcomePage() {
  const user = await requireUser();
  const pool = getPool();
  const [invitations, projects] = await Promise.all([
    listMyInvitations(pool, user),
    listProjects(pool, user),
  ]);
  const firstName = user.displayName.split(/\s+/)[0];

  return (
    <div className="flex min-h-screen flex-col bg-bg-0">
      <TopBar
        end={
          <>
            {projects.length > 0 && (
              <Link href="/" className={buttonClass({ variant: "ghost", size: "sm" })}>
                Ir a tus bandas
              </Link>
            )}
            <Avatar tone="neutral" initials={initials(user.displayName)} size="md" />
            <form action={signOut}>
              <IconButton type="submit" aria-label="Cerrar sesión" title="Cerrar sesión" className="border-line">
                <LogOut {...iconProps} />
              </IconButton>
            </form>
          </>
        }
      >
        <BrandLockup href="/" className="" />
      </TopBar>
      <main className="mx-auto flex w-full max-w-[880px] flex-col gap-8 px-6 py-12 max-desktop:px-4 max-desktop:py-6">
        {!user.emailVerified && <VerifyEmailBanner email={user.email} />}
        <div>
          <h1 className="m-0 text-display">Hola, {firstName}</h1>
          <p className="mt-2 mb-0 text-[15px]/[20px] text-ink-muted">
            Creá una banda para tu grupo o sumate a una que te haya invitado.
          </p>
        </div>
        <div className="grid grid-cols-2 items-start gap-6 max-desktop:grid-cols-1">
          <Panel
            highlighted
            icon={<Plus {...iconProps} className="size-5" />}
            title="Crear una banda"
          >
            <p className="m-0 text-[14px]/[20px] text-ink-muted">
              Una banda por grupo. Vas a ser su Dueño y su primer Admin.
            </p>
            <CreateProjectForm disabled={!user.emailVerified} />
          </Panel>
          <Panel icon={<Mail {...iconProps} className="size-5" />} title="Invitaciones">
            {invitations.length > 0 ? (
              <ul className="m-0 grid list-none gap-3 p-0">
                {invitations.map((invitation) => (
                  <li key={invitation.id} className="flex flex-col gap-3 rounded-md bg-bg-3 p-4">
                    <InvitationSummary invitation={invitation} />
                    <AcceptInvitationForm
                      invitationId={invitation.id}
                      projectId={invitation.projectId}
                      className="items-start"
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="m-0 text-[14px]/[20px] text-ink-muted">
                {user.emailVerified ? (
                  <>
                    No tenés invitaciones pendientes. Cuando una banda te invite a{" "}
                    <b className="text-ink wrap-anywhere">{user.email}</b>, la vas a ver acá.
                  </>
                ) : (
                  "Verificá tu correo para ver las invitaciones que te mandaron."
                )}
              </p>
            )}
          </Panel>
        </div>
      </main>
    </div>
  );
}

function Panel({
  icon,
  title,
  highlighted = false,
  children,
}: {
  icon: ReactNode;
  title: string;
  highlighted?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      className={`flex flex-col gap-4 rounded-lg border bg-bg-2 p-6 max-desktop:p-5 ${highlighted ? "border-spotlight" : "border-line"}`}
    >
      <span
        className={`inline-grid size-10 place-items-center rounded-md ${highlighted ? "bg-spotlight text-on-spotlight" : "bg-bg-3 text-ink"}`}
      >
        {icon}
      </span>
      <h2 className="m-0 text-title">{title}</h2>
      {children}
    </section>
  );
}
