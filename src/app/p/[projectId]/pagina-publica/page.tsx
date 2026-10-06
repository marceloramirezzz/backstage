import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonClass } from "@/components/ui/button.tsx";
import { getPool } from "@/db/pool.ts";
import { requestOrigin } from "@/lib/origin.ts";
import { requireUser } from "@/lib/session.ts";
import {
  getLandingContent,
  getLandingProfile,
  getLandingSettings,
  MAX_ABOUT_LENGTH,
  MAX_AUDIO,
  MAX_CAPTION_LENGTH,
  MAX_CONTACT_LABEL_LENGTH,
  MAX_CONTACT_VALUE_LENGTH,
  MAX_CONTACTS,
  MAX_GENRE_LENGTH,
  MAX_PHOTOS,
  MAX_TAGLINE_LENGTH,
  MAX_TITLE_LENGTH,
  MAX_TRAVEL_AREA_LENGTH,
  MAX_VIDEOS,
  MAX_YEARS_ACTIVE,
} from "@/services/landing-page.ts";
import { getPermissions } from "@/services/permissions.ts";
import { saveAudio, saveVideos } from "./actions.ts";
import { AlbumForm } from "./album-form.tsx";
import { ContactsForm } from "./contacts-form.tsx";
import { LandingForm } from "./landing-form.tsx";
import { MediaForm } from "./media-form.tsx";
import { ProfileForm } from "./profile-form.tsx";

export const metadata: Metadata = { title: "Página pública · Backstage" };

// Admin settings for the Banda's public page: off by default.
export default async function PublicPageSettings({
  params,
}: PageProps<"/p/[projectId]/pagina-publica">) {
  const user = await requireUser();
  const { projectId } = await params;
  const pool = getPool();
  if (!(await getPermissions(pool, user, projectId)).administer) notFound();
  const [settings, content, profile] = await Promise.all([
    getLandingSettings(pool, user, projectId),
    getLandingContent(pool, user, projectId),
    getLandingProfile(pool, user, projectId),
  ]);
  const origin = await requestOrigin();

  return (
    <main className="flex min-w-0 flex-col gap-6 p-6 max-desktop:px-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-display">Página pública</h1>
          <p className="m-0 text-[14px]/[20px] text-ink-muted">
            Muestra el repertorio, los eventos públicos confirmados o pagados, las fotos y los contactos. Los cambios se ven al instante.
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
      <section className="flex min-w-0 flex-col gap-3 rounded-lg border border-line bg-bg-2 p-4">
        <h2 className="m-0 text-[18px]/[24px] font-semibold">Presentación</h2>
        <p className="m-0 text-[13px]/[18px] text-ink-muted">
          Cada sección aparece en la página solo si tiene contenido.
        </p>
        <ProfileForm
          projectId={projectId}
          profile={profile}
          limits={{
            tagline: MAX_TAGLINE_LENGTH,
            genre: MAX_GENRE_LENGTH,
            travelArea: MAX_TRAVEL_AREA_LENGTH,
            about: MAX_ABOUT_LENGTH,
            years: MAX_YEARS_ACTIVE,
          }}
        />
      </section>
      <section className="flex min-w-0 flex-col gap-3 rounded-lg border border-line bg-bg-2 p-4">
        <h2 className="m-0 text-[18px]/[24px] font-semibold">Audio</h2>
        <p className="m-0 text-[13px]/[18px] text-ink-muted">Enlaces https a muestras de audio, en este orden.</p>
        <MediaForm
          projectId={projectId}
          items={content.audio}
          save={saveAudio}
          max={MAX_AUDIO}
          maxTitle={MAX_TITLE_LENGTH}
          rowKey="audio"
          empty="Todavía no hay audios."
          addLabel="Agregar audio"
          urlLabel="Dirección del audio"
          urlPlaceholder="https://…"
        />
      </section>
      <section className="flex min-w-0 flex-col gap-3 rounded-lg border border-line bg-bg-2 p-4">
        <h2 className="m-0 text-[18px]/[24px] font-semibold">Videos</h2>
        <p className="m-0 text-[13px]/[18px] text-ink-muted">
          Enlaces de YouTube o Vimeo; se muestran incrustados. Otros sitios no se aceptan.
        </p>
        <MediaForm
          projectId={projectId}
          items={content.videos}
          save={saveVideos}
          max={MAX_VIDEOS}
          maxTitle={MAX_TITLE_LENGTH}
          rowKey="video"
          empty="Todavía no hay videos."
          addLabel="Agregar video"
          urlLabel="Enlace de YouTube o Vimeo"
          urlPlaceholder="https://youtu.be/…"
        />
      </section>
      <section className="flex min-w-0 flex-col gap-3 rounded-lg border border-line bg-bg-2 p-4">
        <h2 className="m-0 text-[18px]/[24px] font-semibold">Fotos</h2>
        <p className="m-0 text-[13px]/[18px] text-ink-muted">
          Pegá la dirección https de cada foto. Se muestran en este orden.
        </p>
        <AlbumForm projectId={projectId} photos={content.photos} max={MAX_PHOTOS} maxCaption={MAX_CAPTION_LENGTH} />
      </section>
      <section className="flex min-w-0 flex-col gap-3 rounded-lg border border-line bg-bg-2 p-4">
        <h2 className="m-0 text-[18px]/[24px] font-semibold">Contacto</h2>
        <p className="m-0 text-[13px]/[18px] text-ink-muted">Cómo te escriben para contratar a la banda.</p>
        <ContactsForm
          projectId={projectId}
          contacts={content.contacts}
          max={MAX_CONTACTS}
          maxLabel={MAX_CONTACT_LABEL_LENGTH}
          maxValue={MAX_CONTACT_VALUE_LENGTH}
        />
      </section>
    </main>
  );
}
