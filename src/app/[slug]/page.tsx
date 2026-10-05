import { Camera, Globe, Link as LinkIcon, type LucideIcon, Mail, MapPin, MessageCircle, Music, Phone, Play, Users } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { DoorMark } from "@/components/ui/brand.tsx";
import { BookingForm } from "./booking-form.tsx";
import { IntensityMeter } from "@/components/ui/intensity-meter.tsx";
import { iconProps } from "@/components/ui/icon-props.ts";
import { getPool } from "@/db/pool.ts";
import { todayIn } from "@/lib/format.ts";
import { initials } from "@/lib/initials.ts";
import { CONTACT_LABELS } from "@/lib/contact-label.ts";
import { contactHref, type ContactPlatform } from "@/lib/contact-link.ts";
import { getPublicLanding, type LandingContact, type PublicAppearance } from "@/services/landing-page.ts";


const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

// One query per request, shared by the metadata and the page.
const loadLanding = cache((slug: string) => getPublicLanding(getPool(), slug, todayIn()));

export async function generateMetadata({ params }: PageProps<"/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const page = await loadLanding(slug);
  return { title: page ? page.name : "Backstage" };
}

const CONTACT_ICONS: Record<ContactPlatform, LucideIcon> = {
  instagram: Camera,
  facebook: Users,
  whatsapp: MessageCircle,
  email: Mail,
  phone: Phone,
  tiktok: Music,
  youtube: Play,
  spotify: Music,
  website: Globe,
  other: LinkIcon,
};

const CONTACT_PILL =
  "inline-flex min-h-12 items-center gap-2.5 rounded-pill border border-line-control px-5 text-[15px] text-ink no-underline";

function Contact({ contact }: { contact: LandingContact }) {
  const Icon = CONTACT_ICONS[contact.platform];
  const href = contactHref(contact.platform, contact.value);
  const name = contact.platform === "other" ? contact.label : CONTACT_LABELS[contact.platform];
  const body = (
    <>
      <Icon {...iconProps} className="size-[18px] shrink-0" />
      <span className="min-w-0 break-words">
        <span className="text-ink-muted">{name}</span> {contact.value}
      </span>
    </>
  );
  return href ? (
    <a href={href} className={`${CONTACT_PILL} hover:bg-bg-3`} rel="noopener noreferrer">
      {body}
    </a>
  ) : (
    <span className={CONTACT_PILL}>{body}</span>
  );
}

function Appearance({ appearance }: { appearance: PublicAppearance }) {
  const { upcoming, date, name, location, startTime } = appearance;
  const [, month, day] = date.split("-");
  return (
    <li
      className={`grid grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-5 border-t border-line py-4 max-sm:gap-3 ${upcoming ? "" : "text-ink-muted"}`}
    >
      <span className="flex flex-col font-mono">
        <span className={`text-[28px]/[32px] font-medium ${upcoming ? "text-spotlight-ink" : ""}`}>{day}</span>
        <span className="text-[12px] uppercase">{MONTHS[Number(month) - 1]}</span>
      </span>
      <span className="flex min-w-0 flex-col">
        <span className={`text-[18px]/[24px] font-medium ${upcoming ? "text-ink" : ""}`}>{name}</span>
        {(location || startTime) && (
          <span className="flex flex-wrap items-center gap-x-3 text-[14px]/[20px] text-ink-muted">
            {location && (
              <span className="flex items-center gap-1">
                <MapPin {...iconProps} className="size-3.5" aria-hidden />
                {location}
              </span>
            )}
            {startTime && <span className="font-mono">{startTime}</span>}
          </span>
        )}
      </span>
      <span className="text-[12px] uppercase tracking-[.06em]">{upcoming ? "Próximo" : "Tocado"}</span>
    </li>
  );
}

// A Banda's public page, for anyone: song titles with intensity and the
// public Confirmed or Paid Events, the photo album and contact links. Nothing else about the Banda is exposed.
export default async function LandingPage({ params }: PageProps<"/[slug]">) {
  const { slug } = await params;
  const page = await loadLanding(slug);
  if (!page) notFound();

  return (
    <div className="min-h-screen bg-bg-0 text-ink">
      <div className="mx-auto flex max-w-[1120px] flex-col gap-16 px-6 pb-12 pt-8 max-sm:gap-12 max-sm:px-4">
        <header className="flex flex-col gap-10">
          <span className="flex items-center gap-3 text-[18px] font-semibold">
            <span
              aria-hidden
              className="inline-grid size-9 place-items-center rounded-pill bg-spotlight text-[13px] font-semibold text-on-spotlight"
            >
              {initials(page.name)}
            </span>
            {page.name}
          </span>
          <h1 className="m-0 text-[72px]/[72px] font-semibold tracking-[-0.035em] max-sm:text-[44px]/[46px]">
            {page.name}
          </h1>
        </header>

        <section id="shows" className="flex flex-col">
          <h2 className="m-0 mb-4 text-[32px]/[36px] font-semibold tracking-[-0.02em]">Dónde vernos</h2>
          {page.appearances.length ? (
            <ul className="m-0 flex list-none flex-col border-b border-line p-0">
              {page.appearances.map((a) => (
                <Appearance key={`${a.date}-${a.name}-${a.startTime}`} appearance={a} />
              ))}
            </ul>
          ) : (
            <p className="m-0 text-ink-muted">Todavía no hay shows públicos.</p>
          )}
        </section>

        <section id="repertorio" className="grid grid-cols-[320px_minmax(0,1fr)] gap-12 max-desktop:grid-cols-1 max-desktop:gap-6">
          <h2 className="m-0 text-[32px]/[36px] font-semibold tracking-[-0.02em]">Repertorio</h2>
          {page.repertoire.length ? (
            <ul className="m-0 list-none p-0 columns-2 gap-12 max-sm:columns-1">
              {page.repertoire.map((item, i) => (
                <li
                  key={`${i}-${item.name}`}
                  className="flex break-inside-avoid items-center justify-between gap-3 border-b border-line py-2.5 text-[15px]"
                >
                  {item.name}
                  <IntensityMeter intensity={item.intensity} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 text-ink-muted">Todavía no hay canciones.</p>
          )}
        </section>

        {page.photos.length > 0 && (
          <section id="fotos" className="flex flex-col gap-4">
            <h2 className="m-0 text-[32px]/[36px] font-semibold tracking-[-0.02em]">Fotos</h2>
            <ul className="m-0 grid list-none grid-cols-3 gap-4 p-0 max-desktop:grid-cols-2 max-sm:grid-cols-1">
              {page.photos.map((photo, i) => (
                <li key={`${i}-${photo.url}`} className="m-0 flex flex-col gap-2">
                  {/* Bands host their photos anywhere: no image optimizer. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.url}
                    alt={photo.caption ?? ""}
                    loading="lazy"
                    className="aspect-[4/3] w-full rounded-lg border border-line bg-bg-2 object-cover"
                  />
                  {photo.caption && <span className="text-[13px]/[18px] text-ink-muted">{photo.caption}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section
          id="contratanos"
          className="flex flex-col gap-5 rounded-xl border border-line bg-bg-2 p-10 max-sm:p-5"
        >
          <h2 className="m-0 text-[32px]/[36px] font-semibold tracking-[-0.02em]">Contratanos</h2>
          <BookingForm slug={slug} bandName={page.name} />
        </section>

        {page.contacts.length > 0 && (
          <section
            id="contacto"
            className="flex flex-col gap-5 rounded-xl border border-line bg-bg-2 p-10 max-sm:p-5"
          >
            <h2 className="m-0 text-[32px]/[36px] font-semibold tracking-[-0.02em]">Contratá a {page.name}</h2>
            <div className="flex flex-wrap gap-3">
              {page.contacts.map((c, i) => (
                <Contact key={`${i}-${c.platform}-${c.value}`} contact={c} />
              ))}
            </div>
          </section>
        )}

        <footer className="flex items-center gap-2 text-[13px] text-ink-muted">
          <DoorMark className="h-[18px]" />
          Hecho con Backstage
        </footer>
      </div>
    </div>
  );
}
