import type { Metadata } from "next";
import { signOut } from "@/app/session-actions.ts";
import { SpotlightMark } from "@/components/ui/brand.tsx";
import { Button } from "@/components/ui/button.tsx";
import { requireUser } from "@/lib/session.ts";

export const metadata: Metadata = { title: "Bienvenida · Backstage" };

// Placeholder for a User with no Banda, until the welcome screen lands.
export default async function WelcomePage() {
  const user = await requireUser();
  return (
    <main className="grid min-h-screen place-items-center bg-bg-0 p-6 max-desktop:px-4">
      <div className="flex w-full max-w-[400px] flex-col items-center gap-4 text-center">
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
