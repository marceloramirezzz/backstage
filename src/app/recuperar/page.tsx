import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session.ts";
import { RequestResetForm } from "./request-reset-form.tsx";

export const metadata: Metadata = { title: "Recuperar contraseña · Backstage" };

export default async function RecoverPage() {
  if (await getCurrentUser()) redirect("/");
  return <RequestResetForm />;
}
