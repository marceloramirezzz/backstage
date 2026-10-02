import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthScreen } from "@/components/auth-screen.tsx";
import { googleErrorMessage } from "@/lib/google-errors.ts";
import { safeReturnPath, withReturnPath } from "@/lib/return-path.ts";
import { getCurrentUser } from "@/lib/session.ts";
import { SignInForm } from "./sign-in-form.tsx";

export const metadata: Metadata = { title: "Ingresar · Backstage" };

export default async function SignInPage({ searchParams }: PageProps<"/ingresar">) {
  const { volver, google } = await searchParams;
  const returnPath = safeReturnPath(typeof volver === "string" ? volver : null);
  if (await getCurrentUser()) redirect(returnPath ?? "/");

  return (
    <AuthScreen
      title="Ingresar a Backstage"
      intro="Los eventos, setlists y repartos de tu banda en un solo lugar."
      footer={
        <>
          ¿Primera vez en Backstage?{" "}
          <Link href={withReturnPath("/crear-cuenta", returnPath)}>Crear una cuenta</Link>
        </>
      }
    >
      <SignInForm
        returnPath={returnPath}
        googleError={googleErrorMessage(typeof google === "string" ? google : undefined)}
      />
    </AuthScreen>
  );
}
