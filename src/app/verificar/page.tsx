import type { Metadata } from "next";
import Link from "next/link";
import { AuthScreen } from "@/components/auth-screen.tsx";
import { buttonClass } from "@/components/ui/button.tsx";
import { getCurrentUser } from "@/lib/session.ts";
import { InvalidLink, VerifyEmail } from "./verify-email.tsx";

export const metadata: Metadata = { title: "Verificar correo · Backstage" };

// Where the verification email's link lands. Verifying takes a click, not
// just the visit, so mail scanners that open links don't use it up.
export default async function VerifyPage({ searchParams }: PageProps<"/verificar">) {
  const { token } = await searchParams;
  const user = await getCurrentUser();

  const hasToken = typeof token === "string" && token !== "";
  // With a token, whoever is signed in may not be the User it's for, so it's
  // always offered: following it signs that User in.
  if (!hasToken && user?.emailVerified) {
    return (
      <AuthScreen title="Tu correo ya está verificado" intro={user.email}>
        <Link href="/" className={buttonClass({ variant: "primary", size: "lg", className: "justify-center" })}>
          Ir a Backstage
        </Link>
      </AuthScreen>
    );
  }
  if (!hasToken) return <InvalidLink email={user?.email} />;
  return <VerifyEmail token={token} email={user?.email} />;
}
