import { ScrollText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { buttonClass } from "@/components/ui/button.tsx";
import { iconProps } from "@/components/ui/icon-props.ts";
import { IntensityMeter } from "@/components/ui/intensity-meter.tsx";
import { StatusLabel } from "@/components/ui/status-label.tsx";
import { Tag } from "@/components/ui/tag.tsx";
import { getPool } from "@/db/pool.ts";
import { eventTimeRange, formatLongDate } from "@/lib/calendar.ts";
import {
  formatClock,
  formatDuration,
  formatGuaranies,
  formatShortDate,
} from "@/lib/format.ts";
import { requireUser } from "@/lib/session.ts";
import { ServiceError } from "@/services/errors.ts";
import { getAttendance } from "@/services/attendance.ts";
import { getExpenses } from "@/services/expenses.ts";
import { getEvent, type Event } from "@/services/events.ts";
import { getEventBookingRequestId } from "@/services/booking-requests.ts";
import { getPermissions } from "@/services/permissions.ts";
import { getEventMemberRules, getEventPayout } from "@/services/splits.ts";
import { formatTotal } from "../../setlists/total.ts";
import { teleprompterHref } from "@/lib/teleprompter-href.ts";
import { AttendanceSection } from "./attendance.tsx";
import { EventControls } from "./event-controls.tsx";
import { ExpensesSection } from "./expenses.tsx";
import { NotifyAttendance } from "./notify-attendance.tsx";
import { RepartoSection } from "./reparto.tsx";

export const metadata: Metadata = { title: "Evento · Backstage" };

// One Evento: its details and the Setlist it copied. Every Member sees it;
// Members who can edit events also edit, move the status of and delete it.
export default async function EventPage({
  params,
}: PageProps<"/p/[projectId]/eventos/[eventId]">) {
  const user = await requireUser();
  const { projectId, eventId } = await params;

  // The layout has already turned a Project the User isn't in into a 404.
  const pool = getPool();
  const permissions = await getPermissions(pool, user, projectId);
  const event = await getEvent(pool, user, projectId, eventId).catch((err) => {
    if (err instanceof ServiceError && err.code === "not_found") notFound();
    throw err;
  });
  const canEdit = permissions.editRepertoireSetlistsEvents;
  const attendance = await getAttendance(pool, user, projectId, eventId);
  const expenses = await getExpenses(pool, user, projectId, eventId);
  const payout = await getEventPayout(pool, user, projectId, eventId);
  const bookingRequestId = await getEventBookingRequestId(pool, user, projectId, eventId);
  const split = permissions.administer
    ? await getEventMemberRules(pool, user, projectId, eventId)
    : undefined;

  return (
    <main className="flex min-w-0 flex-col gap-3 p-4 max-desktop:px-3">
      <nav
        aria-label="Ruta"
        className="flex items-center gap-2 text-[13px]/[18px]"
      >
        <Link href={`/p/${projectId}/calendario`} className="text-ink-muted">
          Calendario
        </Link>
        <span aria-hidden className="text-ink-subtle">
          ›
        </span>
        <span aria-current="page">{event.name}</span>
      </nav>
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex min-w-0 flex-col gap-2">
          <h1
            className={`m-0 text-display ${event.status === "cancelled" ? "line-through" : ""}`}
          >
            {event.name}
          </h1>
          <p className="m-0 flex flex-wrap items-center gap-2 text-[14px]/[20px] text-ink-muted">
            <StatusLabel status={event.status} />
            {[formatLongDate(event.date), event.location]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {bookingRequestId && (
            <Link href={`/p/${projectId}/solicitudes/${bookingRequestId}`} className="text-[13px]/[18px] underline">
              Ver la solicitud
            </Link>
          )}
        </div>
        {canEdit && (
          <div className="ml-auto flex flex-col items-end gap-2">
            <NotifyAttendance projectId={projectId} eventId={event.id} />
            <EventControls
              projectId={projectId}
              event={event}
              canSetPay={permissions.seeTotalPayExpenses}
              canDelete={event.status !== "paid" || permissions.administer}
            />
          </div>
        )}
      </div>
      <div className="columns-[420px] gap-x-3 [&>*]:mb-3 [&>*]:break-inside-avoid">
        <Details event={event} />
        <AttendanceSection
          projectId={projectId}
          eventId={event.id}
          attendance={attendance}
          canEdit={canEdit}
          canSetAmount={permissions.seeTotalPayExpenses}
        />
        {expenses && (
          <ExpensesSection
            projectId={projectId}
            eventId={event.id}
            summary={expenses}
            canEdit={canEdit}
          />
        )}
        <RepartoSection
          projectId={projectId}
          eventId={event.id}
          payout={payout}
          split={split}
        />
        <SetlistSection projectId={projectId} event={event} />
      </div>
    </main>
  );
}

function Card({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-line bg-bg-1 p-3">
      <div className="flex items-center justify-between gap-4">
        <h2 className="m-0 text-[12px]/[16px] font-semibold uppercase tracking-wide text-ink-muted">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Details({ event }: { event: Event }) {
  const facts: [string, ReactNode][] = [
    ["Fecha", formatLongDate(event.date)],
    [
      "Hora",
      event.startTime ? (
        <span className="font-mono">
          {eventTimeRange(event.startTime, event.durationMinutes)}
        </span>
      ) : (
        "Sin definir"
      ),
    ],
    [
      "Duración",
      <span key="d" className="font-mono">
        {formatDuration(event.durationMinutes)}
      </span>,
    ],
    ["Lugar", event.location ?? "Sin definir"],
  ];
  if (event.pay !== null) {
    facts.push([
      "Cachet",
      <span key="p" className="font-mono">
        {formatGuaranies(event.pay)}
      </span>,
    ]);
  }
  facts.push(["Página pública", event.isPublic ? "Se muestra" : "Privado"]);
  return (
    <Card title="Detalles">
      <dl className="m-0 grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-x-4 gap-y-2">
        {facts.map(([label, value]) => (
          <div key={label} className="flex flex-col gap-0.5">
            <dt className="text-[12px]/[16px] text-ink-muted">{label}</dt>
            <dd className="m-0 text-[14px]/[20px] font-medium">{value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function SetlistSection({
  projectId,
  event,
}: {
  projectId: string;
  event: Event;
}) {
  const { setlist } = event;
  if (!setlist) {
    return (
      <Card title="Setlist">
        <p className="m-0 text-[14px]/[20px] text-ink-muted">
          Este evento todavía no tiene setlist. Elegí una al editarlo y se copia
          acá.
        </p>
      </Card>
    );
  }
  const count = setlist.items.length;
  return (
    <Card
      title="Setlist"
      aside={
        <span className="flex items-center gap-3">
          <span className="text-[13px]/[18px] text-ink-muted">
            {setlist.name}
          </span>
          {count > 0 && (
            <Link
              href={teleprompterHref(projectId, {
                kind: "event",
                id: event.id,
              })}
              className={buttonClass({ variant: "secondary", size: "sm" })}
            >
              <ScrollText {...iconProps} />
              Teleprompter
            </Link>
          )}
        </span>
      }
    >
      {count ? (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-[14px]/[20px]">
            <thead>
              <tr className="text-[12px]/[16px] font-medium text-ink-muted">
                <th className="w-10 py-2 pr-3 font-medium">#</th>
                <th className="py-2 pr-3 font-medium">Título</th>
                <th className="py-2 pr-3 font-medium max-sm:hidden">Tono</th>
                <th className="py-2 pr-3 font-medium">Duración</th>
                <th className="py-2 font-medium max-sm:hidden">Intensidad</th>
              </tr>
            </thead>
            <tbody>
              {setlist.items.map((item, i) => (
                <tr key={i} className="border-t border-line">
                  <td className="py-3 pr-3 font-mono text-[12px] text-ink-subtle">
                    {String(i + 1).padStart(2, "0")}
                  </td>
                  <td className="py-3 pr-3">
                    <span className="inline-flex flex-wrap items-center gap-2">
                      {item.name}
                      {item.kind === "selection" && <Tag>Enganchado</Tag>}
                    </span>
                  </td>
                  <td className="py-3 pr-3 font-mono text-[13px] max-sm:hidden">
                    {item.key ?? "–"}
                  </td>
                  <td className="py-3 pr-3 font-mono text-[13px]">
                    {formatClock(item.durationSeconds)}
                  </td>
                  <td className="py-3 max-sm:hidden">
                    <IntensityMeter intensity={item.intensity} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="m-0 text-[14px]/[20px] text-ink-muted">
          La copia de la setlist no tiene ítems.
        </p>
      )}
      <p className="m-0 flex flex-wrap justify-between gap-2 border-t border-line pt-3 text-[13px]/[18px] text-ink-muted">
        <span>
          {count} {count === 1 ? "ítem" : "ítems"} · copiada de «{setlist.name}»
          el {formatShortDate(setlist.copiedAt)}
        </span>
        <span className="font-mono">
          {formatTotal(setlist.durationSeconds)}
        </span>
      </p>
    </Card>
  );
}
