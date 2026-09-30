import type { Metadata } from "next";
import { signOut } from "@/app/session-actions.ts";
import { SpotlightMark } from "@/components/ui/brand.tsx";
import { Button } from "@/components/ui/button.tsx";
import { VerifyEmailBanner } from "@/components/verify-email-banner.tsx";
import { requireUser } from "@/lib/session.ts";

export const metadata: Metadata = { title: "Bienvenida · Backstage" };

// Placeholder for a User with no Banda, until the welcome screen lands. It's
// the only app page an unverified User can reach, as a Membership needs a
// verified email.
export default async function WelcomePage() {
  const user = await requireUser();
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[880px] flex-col gap-8 bg-bg-0 px-6 py-12 max-desktop:px-4 max-desktop:py-6">
      {!user.emailVerified && <VerifyEmailBanner email={user.email} />}
      <div className="flex grow flex-col items-center justify-center gap-4 text-center">
        <SpotlightMark />
        <h1 className="m-0 text-[28px]/[32px] font-semibold tracking-[-0.02em]">
          Hola, {user.displayName}
        </h1>
        <p className="m-0 text-[14px] text-ink-muted">
          Todavía no hay ninguna banda en tu cuenta.
        </p>
        <form action={signOut}>
          <Button type="submit">Cerrar sesión</Button>
        </form>
      </div>
    </main>
  );
}
