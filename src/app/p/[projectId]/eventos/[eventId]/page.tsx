import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { IntensityMeter } from "@/components/ui/intensity-meter.tsx";
import { StatusLabel } from "@/components/ui/status-label.tsx";
import { Tag } from "@/components/ui/tag.tsx";
import { getPool } from "@/db/pool.ts";
import { eventTimeRange, formatLongDate } from "@/lib/calendar.ts";
import { DEFAULT_TIME_ZONE, formatClock, formatDuration, formatGuaranies } from "@/lib/format.ts";
import { requireUser } from "@/lib/session.ts";
import { ServiceError } from "@/services/errors.ts";
import { getAttendance } from "@/services/attendance.ts";
import { getExpenses } from "@/services/expenses.ts";
import { getEvent, type Event } from "@/services/events.ts";
import { getPermissions } from "@/services/permissions.ts";
import { listSetlists } from "@/services/setlists.ts";
import { formatTotal } from "../../setlists/total.ts";
import { AttendanceSection } from "./attendance.tsx";
import { EventControls } from "./event-controls.tsx";
import { ExpensesSection } from "./expenses.tsx";

export const metadata: Metadata = { title: "Evento · Backstage" };

const copiedOn = (iso: string) =>
  new Intl.DateTimeFormat("es-PY", { day: "numeric", month: "short", timeZone: DEFAULT_TIME_ZONE })
    .format(new Date(iso))
    .replace(".", "");

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
  const setlists = canEdit ? await listSetlists(pool, user, projectId) : [];

  return (
    <main className="flex min-w-0 flex-col gap-6 p-6 max-desktop:px-4">
      <nav aria-label="Ruta" className="flex items-center gap-2 text-[13px]/[18px]">
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
          <h1 className={`m-0 text-display ${event.status === "cancelled" ? "line-through" : ""}`}>
            {event.name}
          </h1>
          <p className="m-0 flex flex-wrap items-center gap-2 text-[14px]/[20px] text-ink-muted">
            <StatusLabel status={event.status} />
            {[formatLongDate(event.date), event.location].filter(Boolean).join(" · ")}
          </p>
        </div>
        {canEdit && (
          <div className="ml-auto">
            <EventControls
              projectId={projectId}
              event={event}
              setlists={setlists.map(({ id, name }) => ({ id, name }))}
              canSetPay={permissions.seeTotalPayExpenses}
              canDelete={event.status !== "paid" || permissions.administer}
            />
          </div>
        )}
      </div>
      <Details event={event} />
      <AttendanceSection
        projectId={projectId}
        eventId={event.id}
        attendance={attendance}
        currentUserId={user.id}
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
      <SetlistSection event={event} />
    </main>
  );
}

function Card({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-lg border border-line bg-bg-1 p-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="m-0 text-heading">{title}</h2>
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
        <span className="font-mono">{eventTimeRange(event.startTime, event.durationMinutes)}</span>
      ) : (
        "Sin definir"
      ),
    ],
    ["Duración", <span key="d" className="font-mono">{formatDuration(event.durationMinutes)}</span>],
    ["Lugar", event.location ?? "Sin definir"],
  ];
  if (event.pay !== null) {
    facts.push(["Cachet", <span key="p" className="font-mono">{formatGuaranies(event.pay)}</span>]);
  }
  facts.push(["Página pública", event.isPublic ? "Se muestra" : "Privado"]);
  return (
    <Card title="Detalles">
      <dl className="m-0 grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-x-6 gap-y-4">
        {facts.map(([label, value]) => (
          <div key={label} className="flex flex-col gap-1">
            <dt className="text-[12px]/[16px] text-ink-muted">{label}</dt>
            <dd className="m-0 text-[14px]/[20px] font-medium">{value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function SetlistSection({ event }: { event: Event }) {
  const { setlist } = event;
  if (!setlist) {
    return (
      <Card title="Setlist">
        <p className="m-0 text-[14px]/[20px] text-ink-muted">
          Este evento todavía no tiene setlist. Elegí una al editarlo y se copia acá.
        </p>
      </Card>
    );
  }
  const count = setlist.items.length;
  return (
    <Card title="Setlist" aside={<span className="text-[13px]/[18px] text-ink-muted">{setlist.name}</span>}>
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
                  <td className="py-3 pr-3 font-mono text-[13px] max-sm:hidden">{item.key ?? "–"}</td>
                  <td className="py-3 pr-3 font-mono text-[13px]">{formatClock(item.durationSeconds)}</td>
                  <td className="py-3 max-sm:hidden">
                    <IntensityMeter intensity={item.intensity} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="m-0 text-[14px]/[20px] text-ink-muted">La copia de la setlist no tiene ítems.</p>
      )}
      <p className="m-0 flex flex-wrap justify-between gap-2 border-t border-line pt-3 text-[13px]/[18px] text-ink-muted">
        <span>
          {count} {count === 1 ? "ítem" : "ítems"} · copiada de «{setlist.name}» el{" "}
          {copiedOn(setlist.copiedAt)}
        </span>
        <span className="font-mono">{formatTotal(setlist.durationSeconds)}</span>
      </p>
    </Card>
  );
}
