import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPool } from "@/db/pool.ts";
import {
  BOOKING_STATUS_LABELS,
  BOOKING_STATUSES,
  EVENT_TYPE_LABELS,
  EVENT_TYPES,
  URGENCY_LABELS,
  type BookingEventType,
  type BookingStatus,
} from "@/lib/booking.ts";
import { Button } from "@/components/ui/button.tsx";
import { Field, Input, Select } from "@/components/ui/field.tsx";
import { requireUser } from "@/lib/session.ts";
import { listBookingRequests } from "@/services/booking-requests.ts";
import { ServiceError } from "@/services/errors.ts";
import { getPermissions } from "@/services/permissions.ts";

export const metadata: Metadata = { title: "Solicitudes · Backstage" };

// The Banda's Solicitudes, newest first. Only for those who manage bookings.
export default async function BookingRequests({
  params,
  searchParams,
}: PageProps<"/p/[projectId]/solicitudes">) {
  const user = await requireUser();
  const { projectId } = await params;
  const pool = getPool();
  if (!(await getPermissions(pool, user, projectId)).manageBookings) notFound();
  const query = await searchParams;
  const one = (name: string) => {
    const value = query[name];
    return (Array.isArray(value) ? value[0] : value) || undefined;
  };
  // Anything unrecognised in the address is simply not applied.
  const status = BOOKING_STATUSES.find((s) => s === one("estado"));
  const eventType = EVENT_TYPES.find((t) => t === one("tipo"));
  const day = (name: string) => (/^\d{4}-\d{2}-\d{2}$/.test(one(name) ?? "") ? one(name) : undefined);
  const from = day("desde");
  const to = day("hasta");
  const filtered = Boolean(status || eventType || from || to);
  const requests = await listBookingRequests(pool, user, projectId, { status, eventType, from, to }).catch(
    (err) => {
      if (err instanceof ServiceError && err.code === "invalid_input") return [];
      throw err;
    },
  );

  return (
    <main className="flex min-w-0 flex-col gap-6 p-6 max-desktop:px-4">
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-display">Solicitudes</h1>
        <p className="m-0 text-[14px]/[20px] text-ink-muted">
          Pedidos de contratación que llegan desde la página pública.
        </p>
      </div>
      <form method="get" className="flex flex-wrap items-end gap-3">
        <Field label="Estado" className="w-48">
          <Select name="estado" defaultValue={status ?? ""}>
            <option value="">Todos</option>
            {BOOKING_STATUSES.map((s: BookingStatus) => (
              <option key={s} value={s}>
                {BOOKING_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Tipo de evento" className="w-48">
          <Select name="tipo" defaultValue={eventType ?? ""}>
            <option value="">Todos</option>
            {EVENT_TYPES.map((t: BookingEventType) => (
              <option key={t} value={t}>
                {EVENT_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Fecha desde" className="w-40">
          <Input type="date" name="desde" defaultValue={from ?? ""} />
        </Field>
        <Field label="Fecha hasta" className="w-40">
          <Input type="date" name="hasta" defaultValue={to ?? ""} />
        </Field>
        <Button type="submit" variant="secondary">
          Filtrar
        </Button>
        {filtered && (
          <Link href={`/p/${projectId}/solicitudes`} className="py-2 text-[13px]/[18px] text-ink-muted">
            Limpiar
          </Link>
        )}
      </form>
      {requests.length ? (
        <ul className="m-0 flex list-none flex-col border-b border-line p-0">
          {requests.map((r) => (
            <li key={r.id} className="border-t border-line">
              <Link
                href={`/p/${projectId}/solicitudes/${r.id}`}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 py-4 text-ink no-underline hover:bg-bg-2"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[16px]/[22px] font-medium">{r.clientName}</span>
                  <span className="truncate text-[13px]/[18px] text-ink-muted">
                    {EVENT_TYPE_LABELS[r.eventType]} · <span className="font-mono">{r.eventDate}</span>
                    {r.location ? ` · ${r.location}` : ""}
                  </span>
                </span>
                <span className="flex items-center gap-2 text-[12px]/[16px]">
                  {(r.urgency === "urgent" || r.urgency === "high") && (
                    <span
                      className={`rounded-pill border px-2 py-0.5 font-semibold ${
                        r.urgency === "urgent"
                          ? "border-status-cancelled bg-status-cancelled-bg text-status-cancelled"
                          : "border-status-pending bg-status-pending-bg text-status-pending"
                      }`}
                    >
                      {URGENCY_LABELS[r.urgency]}
                    </span>
                  )}
                  <span className="rounded-pill border border-line-control px-2 py-0.5">
                    {BOOKING_STATUS_LABELS[r.status]}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 text-ink-muted">
          {filtered ? "Ninguna solicitud coincide con estos filtros." : "Todavía no recibiste solicitudes."}
        </p>
      )}
    </main>
  );
}
