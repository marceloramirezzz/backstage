"use client";

import { ArrowRight, ChevronLeft, ChevronRight, Pencil, Plus, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  DeleteEventDialog,
  EventDialog,
  type SetlistOption,
} from "@/components/events/event-dialogs.tsx";
import { Button, buttonClass, IconButton } from "@/components/ui/button.tsx";
import { Dialog } from "@/components/ui/dialog.tsx";
import { EventChip } from "@/components/ui/event-chip.tsx";
import { iconProps } from "@/components/ui/icon-props.ts";
import { StatusLabel } from "@/components/ui/status-label.tsx";
import { eventTimeRange, formatLongDate, monthGrid } from "@/lib/calendar.ts";
import { formatDuration, formatGuaranies } from "@/lib/format.ts";
import type { Event } from "@/services/events.ts";
import { formatTotal } from "../setlists/total.ts";

const WEEKDAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

// Chips shown in a day before the rest fold into "+N más".
const CHIPS_PER_DAY = 2;

// Where the quick-view opens as a sheet instead of a popover: phones, and any
// touch screen.
const SHEET_QUERY = "(max-width: 639px), (pointer: coarse)";

function useSheetMode(): boolean {
  return useSyncExternalStore(
    (notify) => {
      const query = window.matchMedia(SHEET_QUERY);
      query.addEventListener("change", notify);
      return () => query.removeEventListener("change", notify);
    },
    () => window.matchMedia(SHEET_QUERY).matches,
    () => false,
  );
}

const timeOf = (event: Event) =>
  event.startTime ? eventTimeRange(event.startTime, event.durationMinutes) : null;

interface Quick {
  event: Event;
  // Where the popover sits, in the grid's own coordinates.
  anchor: { left: number; top: number } | null;
  // What had focus, to give it back.
  trigger: HTMLElement | null;
}

type DialogKind = "new" | "edit" | "delete";

// The month's Eventos: a grid from 640px, an agenda below it, with the
// quick-view each Evento opens and the form to add or edit one.
export function CalendarView({
  projectId,
  month,
  today,
  events,
  setlists,
  canEdit,
  canSetPay,
  canDeletePaid,
  prevHref,
  nextHref,
  todayHref,
}: {
  projectId: string;
  month: string;
  today: string;
  events: Event[];
  setlists: SetlistOption[];
  canEdit: boolean;
  canSetPay: boolean;
  canDeletePaid: boolean;
  prevHref: string;
  nextHref: string;
  todayHref: string;
}) {
  const [quick, setQuick] = useState<Quick | null>(null);
  const [dialog, setDialog] = useState<DialogKind | null>(null);
  // Kept after closing, so a closing dialog still has its Evento.
  const [target, setTarget] = useState<Event | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const sheet = useSheetMode();
  const grid = useRef<HTMLDivElement>(null);

  const days = monthGrid(month);
  const byDay = new Map<string, Event[]>();
  for (const event of events) byDay.set(event.date, [...(byDay.get(event.date) ?? []), event]);

  const closeQuick = () => {
    quick?.trigger?.focus();
    setQuick(null);
  };
  const openQuick = (event: Event, trigger: HTMLElement) => {
    const box = grid.current?.getBoundingClientRect();
    const rect = trigger.getBoundingClientRect();
    const anchor = box
      ? {
          left: Math.max(0, Math.min(rect.left - box.left, box.width - 316)),
          top: Math.max(0, rect.top - box.top),
        }
      : null;
    setQuick({ event, anchor, trigger });
  };

  useEffect(() => {
    if (!quick || sheet) return;
    const onPointer = (e: PointerEvent) => {
      const el = e.target as HTMLElement;
      if (!el.closest("[data-quick-view]") && !el.closest("[aria-selected=true]")) {
        setQuick(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        quick.trigger?.focus();
        setQuick(null);
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [quick, sheet]);

  const act = (kind: DialogKind, event: Event | null) => {
    setTarget(event);
    setDialog(kind);
    setQuick(null);
  };
  const closeDialog = () => setDialog(null);
  const defaultDate = today.startsWith(month) ? today : `${month}-01`;

  const chip = (event: Event) => (
    <EventChip
      key={event.id}
      status={event.status}
      name={event.name}
      time={timeOf(event)}
      aria-selected={quick?.event.id === event.id}
      aria-haspopup="dialog"
      onClick={(e) => openQuick(event, e.currentTarget)}
    />
  );

  const agendaDays = days.filter((d) => !d.outside && byDay.has(d.date));
  const quickView = quick && (
    <QuickView
      projectId={projectId}
      event={quick.event}
      canEdit={canEdit}
      canDelete={canEdit && (quick.event.status !== "paid" || canDeletePaid)}
      onEdit={() => act("edit", quick.event)}
      onDelete={() => act("delete", quick.event)}
      onClose={closeQuick}
    />
  );

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Link
            href={prevHref}
            aria-label="Mes anterior"
            className="inline-grid size-9 place-items-center rounded-pill border border-line-control text-ink-muted hover:bg-bg-3 hover:text-ink"
          >
            <ChevronLeft {...iconProps} />
          </Link>
          <Link href={todayHref} className={buttonClass({ variant: "secondary" })}>
            Hoy
          </Link>
          <Link
            href={nextHref}
            aria-label="Mes siguiente"
            className="inline-grid size-9 place-items-center rounded-pill border border-line-control text-ink-muted hover:bg-bg-3 hover:text-ink"
          >
            <ChevronRight {...iconProps} />
          </Link>
        </div>
        {canEdit && (
          <Button variant="primary" className="ml-auto" onClick={() => act("new", null)}>
            <Plus {...iconProps} />
            Nuevo evento
          </Button>
        )}
      </div>

      <div ref={grid} className="relative">
        <div className="max-sm:hidden">
          <div className="grid grid-cols-7 overflow-hidden rounded-lg border-t border-l border-line bg-bg-1">
            {WEEKDAYS.map((weekday) => (
              <div
                key={weekday}
                className="border-r border-b border-line p-2 text-center text-[12px]/[16px] font-medium tracking-[.06em] text-ink-muted uppercase"
              >
                {weekday}
              </div>
            ))}
            {days.map((d) => {
              const dayEvents = byDay.get(d.date) ?? [];
              const showAll = expanded === d.date;
              const shown = showAll ? dayEvents : dayEvents.slice(0, CHIPS_PER_DAY);
              const hidden = dayEvents.length - shown.length;
              return (
                <div
                  key={d.date}
                  className={`flex min-h-28 min-w-0 flex-col gap-1.5 border-r border-b border-line p-2 ${
                    d.date === today ? "bg-spotlight-soft" : d.outside ? "bg-bg-0" : "hover:bg-bg-2"
                  }`}
                >
                  <span
                    className={`font-mono text-[12px]/[16px] ${
                      d.date === today
                        ? "font-medium text-spotlight-ink"
                        : d.outside
                          ? "text-ink-subtle"
                          : "text-ink-muted"
                    }`}
                    aria-label={d.date === today ? `${formatLongDate(d.date)}, hoy` : undefined}
                  >
                    {String(d.day).padStart(2, "0")}
                  </span>
                  {shown.map(chip)}
                  {hidden > 0 && (
                    <button
                      type="button"
                      onClick={() => setExpanded(d.date)}
                      className="cursor-pointer border-0 bg-transparent p-0 text-left text-[12px]/[16px] font-medium text-ink-muted hover:text-ink"
                    >
                      +{hidden} más
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="sm:hidden">
          {agendaDays.length ? (
            <ol className="m-0 flex list-none flex-col gap-4 p-0">
              {agendaDays.map((d) => (
                <li key={d.date} className="flex flex-col gap-2">
                  <h3
                    className={`m-0 text-[13px]/[18px] font-medium ${d.date === today ? "text-spotlight-ink" : "text-ink-muted"}`}
                  >
                    {formatLongDate(d.date)}
                    {d.date === today && " · hoy"}
                  </h3>
                  <div className="flex flex-col gap-2">{byDay.get(d.date)?.map(chip)}</div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="m-0 rounded-lg border border-line bg-bg-2 px-6 py-8 text-center text-[14px]/[20px] text-ink-muted">
              No hay eventos este mes.
            </p>
          )}
        </div>

        {!sheet && quick?.anchor && (
          <div
            data-quick-view
            role="dialog"
            aria-label={quick.event.name}
            style={{ left: quick.anchor.left, top: quick.anchor.top }}
            className="absolute z-20 w-[300px] rounded-lg bg-bg-2 p-4 shadow-pop"
          >
            {quickView}
          </div>
        )}
      </div>

      {sheet && (
        <Dialog open={Boolean(quick)} onClose={() => setQuick(null)} title={quick?.event.name ?? ""}>
          {quickView}
        </Dialog>
      )}

      <EventDialog
        projectId={projectId}
        event={dialog === "edit" ? (target ?? undefined) : undefined}
        defaultDate={defaultDate}
        setlists={setlists}
        canSetPay={canSetPay}
        open={dialog === "new" || dialog === "edit"}
        onClose={closeDialog}
      />
      {target && (
        <DeleteEventDialog
          projectId={projectId}
          event={target}
          open={dialog === "delete"}
          onClose={closeDialog}
        />
      )}
    </>
  );
}

// What the quick-view shows of an Evento: when and where, Cachet (only for
// those who can see it), Setlist and status, and the way to its page.
function QuickView({
  projectId,
  event,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
  onClose,
}: {
  projectId: string;
  event: Event;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const time = timeOf(event);
  const rows: [string, ReactNode][] = [];
  if (event.pay !== null) {
    rows.push(["Cachet", <span key="pay" className="font-mono">{formatGuaranies(event.pay)}</span>]);
  }
  rows.push([
    "Setlist",
    event.setlist ? `${event.setlist.name} · ${formatTotal(event.setlist.durationSeconds)}` : "Sin setlist",
  ]);
  rows.push(["Duración", formatDuration(event.durationMinutes)]);
  rows.push(["Estado", <StatusLabel key="status" status={event.status} />]);
  return (
    <div className="flex flex-col">
      <div className="mb-4 flex justify-between max-sm:hidden">
        <div className="flex gap-1.5">
          {canDelete && (
            <IconButton square aria-label="Eliminar evento" onClick={onDelete}>
              <Trash2 {...iconProps} />
            </IconButton>
          )}
          {canEdit && (
            <IconButton square aria-label="Editar evento" onClick={onEdit}>
              <Pencil {...iconProps} />
            </IconButton>
          )}
        </div>
        <IconButton square aria-label="Cerrar" onClick={onClose}>
          <X {...iconProps} />
        </IconButton>
      </div>
      <h2 className="m-0 text-title max-sm:hidden">{event.name}</h2>
      <p className="m-0 mt-1 mb-4 text-[13px]/[18px] text-ink-muted">
        {formatLongDate(event.date)}
        {time && ` · ${time}`}
        {event.location && (
          <>
            <br />
            {event.location}
          </>
        )}
      </p>
      <dl className="m-0 mb-4 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-2">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-[13px]/[18px] text-ink-muted">{label}</dt>
            <dd className="m-0 min-w-0 rounded-sm bg-bg-3 px-3 py-1 text-[13px]/[20px]">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-col gap-2 sm:hidden">
        {canEdit && (
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1 justify-center" onClick={onEdit}>
              <Pencil {...iconProps} />
              Editar
            </Button>
            {canDelete && (
              <Button variant="danger" className="flex-1 justify-center" onClick={onDelete}>
                <Trash2 {...iconProps} />
                Eliminar
              </Button>
            )}
          </div>
        )}
      </div>
      <Link
        href={`/p/${projectId}/eventos/${event.id}`}
        className={buttonClass({ variant: "secondary", className: "w-full justify-center max-sm:mt-2" })}
      >
        Abrir evento
        <ArrowRight {...iconProps} />
      </Link>
    </div>
  );
}

