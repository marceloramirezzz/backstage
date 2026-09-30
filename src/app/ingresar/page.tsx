import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SpotlightMark } from "@/components/ui/brand.tsx";
import { safeReturnPath } from "@/lib/return-path.ts";
import { getCurrentUser } from "@/lib/session.ts";
import { SignInForm } from "./sign-in-form.tsx";

export const metadata: Metadata = { title: "Ingresar · Backstage" };

export default async function SignInPage({ searchParams }: PageProps<"/ingresar">) {
  const { volver } = await searchParams;
  const returnPath = safeReturnPath(typeof volver === "string" ? volver : null);
  if (await getCurrentUser()) redirect(returnPath ?? "/");

  return (
    <main className="grid min-h-screen place-items-center bg-bg-0 p-6 max-desktop:px-4">
      <div className="flex w-full max-w-[400px] flex-col gap-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <SpotlightMark />
          <h1 className="m-0 text-[28px]/[32px] font-semibold tracking-[-0.02em]">
            Ingresar a Backstage
          </h1>
          <p className="m-0 text-[14px] text-ink-muted">
            Los eventos, setlists y repartos de tu banda en un solo lugar.
          </p>
        </div>
        <SignInForm returnPath={returnPath} />
      </div>
    </main>
  );
}
