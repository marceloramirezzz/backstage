import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthScreen } from "@/components/auth-screen.tsx";
import { safeReturnPath } from "@/lib/return-path.ts";
import { getCurrentUser } from "@/lib/session.ts";
import { MIN_PASSWORD_LENGTH } from "@/services/accounts.ts";
import { signInPath } from "@/lib/session-cookie.ts";
import { SignUpForm } from "./sign-up-form.tsx";

export const metadata: Metadata = { title: "Crear cuenta · Backstage" };

export default async function SignUpPage({ searchParams }: PageProps<"/crear-cuenta">) {
  const { volver } = await searchParams;
  const returnPath = safeReturnPath(typeof volver === "string" ? volver : null);
  if (await getCurrentUser()) redirect(returnPath ?? "/");

  return (
    <AuthScreen
      title="Crear una cuenta"
      intro="Después vas a poder crear tu banda o sumarte a una que te invite."
      footer={
        <>
          ¿Ya tenés cuenta? <Link href={signInPath(returnPath)}>Ingresar</Link>
        </>
      }
    >
      <SignUpForm returnPath={returnPath} minPasswordLength={MIN_PASSWORD_LENGTH} />
    </AuthScreen>
  );
}
