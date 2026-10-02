import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonClass } from "@/components/ui/button.tsx";
import { getPool } from "@/db/pool.ts";
import { requireUser } from "@/lib/session.ts";
import { getLandingSettings } from "@/services/landing-page.ts";
import { getPermissions } from "@/services/permissions.ts";
import { LandingForm } from "./landing-form.tsx";

export const metadata: Metadata = { title: "Página pública · Backstage" };

// Admin settings for the Banda's public page: off by default.
export default async function PublicPageSettings({
  params,
}: PageProps<"/p/[projectId]/pagina-publica">) {
  const user = await requireUser();
  const { projectId } = await params;
  const pool = getPool();
  if (!(await getPermissions(pool, user, projectId)).administer) notFound();
  const settings = await getLandingSettings(pool, user, projectId);
  const host = (await headers()).get("host") ?? "";
  const origin = host ? `${host.startsWith("localhost") ? "http" : "https"}://${host}` : "";

  return (
    <main className="flex min-w-0 flex-col gap-6 p-6 max-desktop:px-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-display">Página pública</h1>
          <p className="m-0 text-[14px]/[20px] text-ink-muted">
            Muestra el repertorio y los eventos públicos confirmados o pagados. Los cambios se ven al instante.
          </p>
        </div>
        {settings.enabled && settings.slug && (
          <Link
            href={`/${settings.slug}`}
            target="_blank"
            className={`ml-auto ${buttonClass({ variant: "secondary", size: "sm" })}`}
          >
            Ver página
          </Link>
        )}
      </div>
      <section className="flex min-w-0 flex-col gap-3 rounded-lg border border-line bg-bg-2 p-4">
        <LandingForm
          key={`${settings.enabled}-${settings.slug}`}
          projectId={projectId}
          enabled={settings.enabled}
          slug={settings.slug ?? ""}
          origin={origin}
        />
      </section>
    </main>
  );
}
