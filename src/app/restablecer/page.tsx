import type { Metadata } from "next";
import { MIN_PASSWORD_LENGTH } from "@/services/accounts.ts";
import { RequestResetForm } from "../recuperar/request-reset-form.tsx";
import { ResetPasswordForm } from "./reset-password-form.tsx";

export const metadata: Metadata = { title: "Nueva contraseña · Backstage" };

// Where the reset email's link lands. Whoever is signed in may not be the
// User it's for, so the link is always offered.
export default async function ResetPage({ searchParams }: PageProps<"/restablecer">) {
  const { token } = await searchParams;
  if (typeof token !== "string" || token === "") return <RequestResetForm expired />;
  return <ResetPasswordForm token={token} minPasswordLength={MIN_PASSWORD_LENGTH} />;
}
