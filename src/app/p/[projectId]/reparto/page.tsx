import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SplitEditor } from "@/app/p/[projectId]/split-editor.tsx";
import { Avatar } from "@/components/ui/brand.tsx";
import { buttonClass } from "@/components/ui/button.tsx";
import { getPool } from "@/db/pool.ts";
import { addMonths, formatMonthTitle, parseMonth, periodRange } from "@/lib/calendar.ts";
import { DEFAULT_TIME_ZONE, formatGuaranies } from "@/lib/format.ts";
import { initials } from "@/lib/initials.ts";
import { roleLabel } from "@/lib/role-label.ts";
import { requireUser } from "@/lib/session.ts";
import { getPermissions } from "@/services/permissions.ts";
import { getDefaultSplit, listPersonTotals } from "@/services/splits.ts";

export const metadata: Metadata = { title: "Reparto · Backstage" };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const todayIn = () => new Intl.DateTimeFormat("en-CA", { timeZone: DEFAULT_TIME_ZONE }).format(new Date());

const Card = ({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) => (
  <section className="flex min-w-0 flex-col gap-3 rounded-lg border border-line bg-bg-2 p-4">
    <div className="flex items-center justify-between gap-3">
      <h2 className="m-0 text-[15px]/[20px] font-semibold">{title}</h2>
      {aside}
    </div>
    {children}
  </section>
);

// The Banda's default Reparto per Rol and what each person has earned or is
// owed in a month or a year. Admin only: it holds everyone's amounts.
export default async function PayoutsPage({
  params,
  searchParams,
}: PageProps<"/p/[projectId]/reparto">) {
  const user = await requireUser();
  const { projectId } = await params;
  const query = await searchParams;
  const pool = getPool();
  if (!(await getPermissions(pool, user, projectId)).administer) notFound();

  const month = parseMonth(first(query.mes), todayIn().slice(0, 7));
  const byYear = first(query.periodo) === "anio";
  const year = month.slice(0, 4);
  const period = periodRange(month, byYear);
  const [split, totals] = await Promise.all([
    getDefaultSplit(pool, user, projectId),
    listPersonTotals(pool, user, projectId, period),
  ]);
  const href = (m: string, periodo = byYear ? "anio" : "mes") => `/p/${projectId}/reparto?periodo=${periodo}&mes=${m}`;
  const label = byYear ? year : formatMonthTitle(month);
  const step = byYear ? 12 : 1;

  return (
    <main className="flex min-w-0 flex-col gap-6 p-6 max-desktop:px-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-display">Reparto</h1>
          <p className="m-0 text-[14px]/[20px] text-ink-muted">
            Solo los admins ven el reparto de todos. Cada miembro ve únicamente su parte.
          </p>
        </div>
      </div>

      <Card title="Reparto de la banda" aside={<span className="text-[12px] text-ink-muted">Cada evento puede tener el suyo</span>}>
        {split.roles.length ? (
          <SplitEditor
            key={JSON.stringify(split.rules)}
            projectId={projectId}
            roles={split.roles}
            rules={split.rules}
            submitLabel="Guardar reparto"
          />
        ) : (
          <p className="m-0 text-[14px]/[20px] text-ink-muted">Esta banda no tiene roles.</p>
        )}
      </Card>

      <Card
        title={`Por persona · ${label}`}
        aside={
          <span className="flex flex-wrap items-center gap-2">
            <Link href={href(month, "mes")} aria-current={byYear ? undefined : "true"} className={buttonClass({ variant: byYear ? "ghost" : "secondary", size: "sm" })}>
              Mes
            </Link>
            <Link href={href(month, "anio")} aria-current={byYear ? "true" : undefined} className={buttonClass({ variant: byYear ? "secondary" : "ghost", size: "sm" })}>
              Año
            </Link>
            <Link href={href(addMonths(month, -step))} aria-label={byYear ? "Año anterior" : "Mes anterior"} className={buttonClass({ variant: "ghost", size: "sm" })}>
              ‹
            </Link>
            <Link href={href(addMonths(month, step))} aria-label={byYear ? "Año siguiente" : "Mes siguiente"} className={buttonClass({ variant: "ghost", size: "sm" })}>
              ›
            </Link>
          </span>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-[14px]/[20px] max-sm:block max-sm:[&_tbody]:block max-sm:[&_thead]:hidden max-sm:[&_tr]:mb-3 max-sm:[&_tr]:block max-sm:[&_tr]:rounded-md max-sm:[&_tr]:border max-sm:[&_tr]:border-line max-sm:[&_tr]:p-3">
            <thead>
              <tr className="text-[12px]/[16px] font-medium text-ink-muted">
                <th className="border-b border-line px-4 py-2.5 font-medium">Persona</th>
                <th className="border-b border-line px-4 py-2.5 font-medium">Rol</th>
                <th className="border-b border-line px-4 py-2.5 font-medium">Shows</th>
                <th className="border-b border-line px-4 py-2.5 font-medium">Cobrado</th>
                <th className="border-b border-line px-4 py-2.5 font-medium">Por cobrar</th>
              </tr>
            </thead>
            <tbody>
              {totals.map((p) => (
                <tr key={p.userId}>
                  <td className="border-b border-line px-4 py-3 max-sm:block max-sm:border-0 max-sm:px-0 max-sm:py-1">
                    <span className="flex items-center gap-2.5">
                      <Avatar initials={initials(p.displayName)} />
                      {p.displayName}
                    </span>
                  </td>
                  <td className="border-b border-line px-4 py-3 text-ink-muted max-sm:block max-sm:border-0 max-sm:px-0 max-sm:py-1">
                    {roleLabel(p.roleKind, p.roleName)}
                  </td>
                  <td className="border-b border-line px-4 py-3 font-mono text-[13px] max-sm:flex max-sm:justify-between max-sm:border-0 max-sm:px-0 max-sm:py-1">
                    <span className="hidden max-sm:inline text-ink-muted">Shows</span>
                    {p.shows}
                  </td>
                  <td className="border-b border-line px-4 py-3 font-mono text-[13px] max-sm:flex max-sm:justify-between max-sm:border-0 max-sm:px-0 max-sm:py-1">
                    <span className="hidden max-sm:inline text-ink-muted">Cobrado</span>
                    {formatGuaranies(p.earned)}
                  </td>
                  <td className="border-b border-line px-4 py-3 font-mono text-[13px] max-sm:flex max-sm:justify-between max-sm:border-0 max-sm:px-0 max-sm:py-1">
                    <span className="hidden max-sm:inline text-ink-muted">Por cobrar</span>
                    {formatGuaranies(p.expected)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="m-0 text-[12px]/[16px] text-ink-muted">
          Cobrado suma los eventos pagados; Por cobrar, los confirmados que todavía no se pagaron.
        </p>
      </Card>
    </main>
  );
}
