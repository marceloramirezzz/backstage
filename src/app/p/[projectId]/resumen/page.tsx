import { CircleDollarSign, Clock, Mic } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { buttonClass } from "@/components/ui/button.tsx";
import { iconProps } from "@/components/ui/icon-props.ts";
import { getPool } from "@/db/pool.ts";
import { addMonths, formatMonthTitle, parseMonth, periodRange } from "@/lib/calendar.ts";
import { DEFAULT_TIME_ZONE, formatGuaraniesCompact } from "@/lib/format.ts";
import { requireUser } from "@/lib/session.ts";
import { getDashboard } from "@/services/dashboard.ts";

export const metadata: Metadata = { title: "Resumen · Backstage" };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const todayIn = () => new Intl.DateTimeFormat("en-CA", { timeZone: DEFAULT_TIME_ZONE }).format(new Date());

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function StatTile({
  label,
  icon,
  value,
  foot,
  lead,
}: {
  label: string;
  icon: ReactNode;
  value: string;
  foot: string;
  lead?: boolean;
}) {
  return (
    <div className={`grid gap-2 rounded-lg border bg-bg-2 p-4 ${lead ? "border-spotlight" : "border-line"}`}>
      <span className={`flex items-center gap-2 text-[13px]/[18px] font-medium ${lead ? "text-spotlight-ink" : "text-ink-muted"}`}>
        {icon}
        {label}
      </span>
      <span className="font-mono text-[28px]/[32px] font-medium tracking-[-0.02em] tabular-nums">{value}</span>
      <span className="text-[12px]/[16px] text-ink-muted">{foot}</span>
    </div>
  );
}

// Shows, Cobrado and Por cobrar for a month or a year. A Rol that can't see
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

  const dashboard = await getDashboard(getPool(), user, projectId, periodRange(month, byYear));
  const own = dashboard.scope === "own";

  return (
    <main className="flex min-w-0 flex-col gap-6 p-6 max-desktop:px-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-display">Resumen</h1>
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
    </main>
  );
}
