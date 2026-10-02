import { MapPin } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { DoorMark } from "@/components/ui/brand.tsx";
import { IntensityMeter } from "@/components/ui/intensity-meter.tsx";
import { iconProps } from "@/components/ui/icon-props.ts";
import { getPool } from "@/db/pool.ts";
import { todayIn } from "@/lib/format.ts";
import { initials } from "@/lib/initials.ts";
import { getPublicLanding, type PublicAppearance } from "@/services/landing-page.ts";


const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

// One query per request, shared by the metadata and the page.
const loadLanding = cache((slug: string) => getPublicLanding(getPool(), slug, todayIn()));

export async function generateMetadata({ params }: PageProps<"/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const page = await loadLanding(slug);
  return { title: page ? page.name : "Backstage" };
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
// public Confirmed or Paid Events. Nothing else about the Banda is exposed.
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

        <footer className="flex items-center gap-2 text-[13px] text-ink-muted">
          <DoorMark className="h-[18px]" />
          Hecho con Backstage
        </footer>
      </div>
    </div>
  );
}
