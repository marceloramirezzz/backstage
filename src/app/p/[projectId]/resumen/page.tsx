import { CircleDollarSign, Clock, Mic } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { buttonClass } from "@/components/ui/button.tsx";
import { StatTile } from "@/components/ui/stat-tile.tsx";
import { iconProps } from "@/components/ui/icon-props.ts";
import { getPool } from "@/db/pool.ts";
import { addMonths, eventTimeRange, formatLongDate, formatMonthTitle, parseMonth, periodRange } from "@/lib/calendar.ts";
import { formatGuaraniesCompact, todayIn } from "@/lib/format.ts";
import { requireUser } from "@/lib/session.ts";
import { StatusLabel } from "@/components/ui/status-label.tsx";
import { getDashboard } from "@/services/dashboard.ts";
import { listEvents } from "@/services/events.ts";

export const metadata: Metadata = { title: "Inicio · Backstage" };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

const UPCOMING_LIMIT = 5;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// Shows, Cobrado and Por cobrar for a month or a year, then the next Eventos
// whatever the period. A Rol that can't see
// the total pay gets only its own amounts.
export default async function DashboardPage({
  params,
  searchParams,
}: PageProps<"/p/[projectId]/resumen">) {
  const user = await requireUser();
  const { projectId } = await params;
  const query = await searchParams;
  const month = parseMonth(first(query.mes), todayIn().slice(0, 7));
  const byYear = first(query.periodo) === "anio";
  const label = byYear ? month.slice(0, 4) : formatMonthTitle(month);
  const step = byYear ? 12 : 1;
  const href = (m: string, periodo = byYear ? "anio" : "mes") => `/p/${projectId}/resumen?periodo=${periodo}&mes=${m}`;

  const pool = getPool();
  const today = todayIn();
  const [dashboard, ahead] = await Promise.all([
    getDashboard(pool, user, projectId, periodRange(month, byYear)),
    listEvents(pool, user, projectId, { from: today }),
  ]);
  const upcoming = ahead.filter((e) => e.status !== "cancelled").slice(0, UPCOMING_LIMIT);
  const own = dashboard.scope === "own";

  return (
    <main className="flex min-w-0 flex-col gap-6 p-6 max-desktop:px-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-display">Inicio</h1>
          <p className="m-0 text-[14px]/[20px] text-ink-muted">
            {own
              ? "Tu parte de los eventos pagados y de los confirmados que todavía no se pagaron."
              : "Cobrado suma los eventos pagados; Por cobrar, los confirmados que todavía no se pagaron."}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Link href={href(month, "mes")} aria-current={byYear ? undefined : "true"} className={buttonClass({ variant: byYear ? "ghost" : "secondary", size: "sm" })}>
            Mes
          </Link>
          <Link href={href(month, "anio")} aria-current={byYear ? "true" : undefined} className={buttonClass({ variant: byYear ? "secondary" : "ghost", size: "sm" })}>
            Año
          </Link>
          <Link href={href(addMonths(month, -step))} aria-label={byYear ? "Año anterior" : "Mes anterior"} className={buttonClass({ variant: "ghost", size: "sm" })}>
            ‹
          </Link>
          <span className="min-w-[110px] text-center text-[14px]/[20px] font-medium">{label}</span>
          <Link href={href(addMonths(month, step))} aria-label={byYear ? "Año siguiente" : "Mes siguiente"} className={buttonClass({ variant: "ghost", size: "sm" })}>
            ›
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6 max-desktop:grid-cols-1 max-desktop:gap-4">
        <StatTile
          label="Shows"
          icon={<Mic {...iconProps} />}
          value={String(dashboard.shows)}
          foot={`Confirmados y pagados · ${label}`}
        />
        <StatTile
          lead
          label="Cobrado"
          icon={<CircleDollarSign {...iconProps} />}
          value={formatGuaraniesCompact(dashboard.earned)}
          foot={own ? "Tu parte" : plural(dashboard.paidShows, "evento pagado", "eventos pagados")}
        />
        <StatTile
          label="Por cobrar"
          icon={<Clock {...iconProps} />}
          value={formatGuaraniesCompact(dashboard.expected)}
          foot={own ? "Tu parte" : `${plural(dashboard.confirmedShows, "confirmado", "confirmados")}, esperando el pago`}
        />
      </div>

      <section aria-labelledby="proximos" className="flex flex-col gap-3">
        <h2 id="proximos" className="m-0 text-[16px]/[24px] font-medium">
          Próximos eventos
        </h2>
        {upcoming.length === 0 ? (
          <p className="m-0 text-[14px]/[20px] text-ink-muted">No hay eventos próximos.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {upcoming.map((e) => (
              <li key={e.id}>
                <Link
                  href={`/p/${projectId}/eventos/${e.id}`}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-line bg-bg-2 px-4 py-3 hover:border-ink-muted"
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-[14px]/[20px] font-medium">{e.name}</span>
                    <span className="text-[12px]/[16px] text-ink-muted">
                      {formatLongDate(e.date)}
                      {e.startTime && ` · ${eventTimeRange(e.startTime, e.durationMinutes)}`}
                      {e.location && ` · ${e.location}`}
                    </span>
                  </span>
                  <StatusLabel status={e.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
