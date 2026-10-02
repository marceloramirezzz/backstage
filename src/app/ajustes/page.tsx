import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { BrandLockup } from "@/components/ui/brand.tsx";
import { buttonClass } from "@/components/ui/button.tsx";
import { iconProps } from "@/components/ui/icon-props.ts";
import { TopBar } from "@/components/ui/top-bar.tsx";
import { requireUser } from "@/lib/session.ts";
import { MIN_PASSWORD_LENGTH } from "@/services/accounts.ts";
import { AddPasswordForm, DisplayNameForm, ThemePicker } from "./settings-forms.tsx";

export const metadata: Metadata = { title: "Ajustes · Backstage" };

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-lg border border-line bg-bg-1 p-6 max-desktop:p-5">
      <h2 className="m-0 text-heading">{title}</h2>
      {children}
    </section>
  );
}

// The User's own settings, global across Bandas.
export default async function SettingsPage() {
  const user = await requireUser();

  return (
    <div className="flex min-h-screen flex-col bg-bg-0">
      <TopBar
        end={
          <Link href="/" className={buttonClass({ variant: "ghost", size: "sm" })}>
            <ArrowLeft {...iconProps} />
            Volver
          </Link>
        }
      >
        <BrandLockup href="/" className="" />
      </TopBar>
      <main className="mx-auto flex w-full max-w-[640px] flex-col gap-6 px-6 py-12 max-desktop:px-4 max-desktop:py-6">
        <div>
          <h1 className="m-0 text-display">Ajustes</h1>
          <p className="mt-2 mb-0 text-[15px]/[20px] text-ink-muted">{user.email}</p>
        </div>
        <Section title="Perfil">
          <DisplayNameForm displayName={user.displayName} />
        </Section>
        <Section title="Tema">
          <p className="m-0 text-small text-ink-muted">
            Sistema sigue la configuración de tu dispositivo. Se aplica en todos los dispositivos donde ingreses.
          </p>
          <ThemePicker theme={user.theme} />
        </Section>
        <Section title="Contraseña">
          {user.hasPassword ? (
            <p className="m-0 text-small text-ink-muted">
              Ya tenés una contraseña. Para cambiarla, <Link href="/recuperar">pedí un enlace por correo</Link>.
            </p>
          ) : (
            <AddPasswordForm minPasswordLength={MIN_PASSWORD_LENGTH} />
          )}
        </Section>
      </main>
    </div>
  );
}
