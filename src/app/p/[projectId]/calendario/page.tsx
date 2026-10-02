import type { Metadata } from "next";
import { getPool } from "@/db/pool.ts";
import { addMonths, formatMonthTitle, monthGrid, parseMonth } from "@/lib/calendar.ts";
import { STATUS_LABELS } from "@/lib/event-status.ts";
import { todayIn } from "@/lib/format.ts";
import { requireUser } from "@/lib/session.ts";
import { EVENT_STATUSES, listEvents } from "@/services/events.ts";
import { getPermissions } from "@/services/permissions.ts";
import { listSetlists } from "@/services/setlists.ts";
import { StatusLabel } from "@/components/ui/status-label.tsx";
import { CalendarView } from "./calendar-view.tsx";

export const metadata: Metadata = { title: "Calendario · Backstage" };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

// Today on the bands' clock, as `YYYY-MM-DD`.

// The Banda's home: a month of Eventos, as a grid or, under 640px, an agenda.
// Every Member sees them; Members who can edit events also add, edit and
// delete them.
export default async function CalendarPage({
  params,
  searchParams,
}: PageProps<"/p/[projectId]/calendario">) {
  const user = await requireUser();
  const { projectId } = await params;
  const today = todayIn();
  const month = parseMonth(first((await searchParams).mes), today.slice(0, 7));

  // The layout has already turned a Project the User isn't in into a 404.
  const pool = getPool();
  const days = monthGrid(month);
  const permissions = await getPermissions(pool, user, projectId);
  const canEdit = permissions.editRepertoireSetlistsEvents;
  const [events, setlists] = await Promise.all([
    listEvents(pool, user, projectId, { from: days[0].date, to: days.at(-1)!.date }),
    canEdit ? listSetlists(pool, user, projectId) : [],
  ]);

  const inMonth = events.filter((e) => e.date.startsWith(month));
  const toPlay = inMonth.filter(
    (e) => (e.status === "confirmed" || e.status === "paid") && e.date >= today,
  ).length;
  const href = (m: string) => `/p/${projectId}/calendario?mes=${m}`;

  return (
    <main className="flex min-w-0 flex-col gap-6 p-6 max-desktop:px-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-display">{formatMonthTitle(month)}</h1>
          <p className="m-0 text-[14px]/[20px] text-ink-muted">
            {inMonth.length} {inMonth.length === 1 ? "evento" : "eventos"} · {toPlay}{" "}
            {toPlay === 1 ? "confirmado o pagado" : "confirmados o pagados"} por tocar este mes
          </p>
        </div>
        <ul aria-label="Estados" className="m-0 ml-auto flex list-none flex-wrap gap-2 p-0">
          {EVENT_STATUSES.map((status) => (
            <li key={status} title={STATUS_LABELS[status]}>
              <StatusLabel status={status} />
            </li>
          ))}
        </ul>
      </div>
      <CalendarView
        key={month}
        projectId={projectId}
        month={month}
        today={today}
        events={events}
        setlists={setlists.map(({ id, name }) => ({ id, name }))}
        canEdit={canEdit}
        canSetPay={canEdit && permissions.seeTotalPayExpenses}
        canDeletePaid={permissions.administer}
        prevHref={href(addMonths(month, -1))}
        nextHref={href(addMonths(month, 1))}
        todayHref={href(today.slice(0, 7))}
      />
    </main>
  );
}
