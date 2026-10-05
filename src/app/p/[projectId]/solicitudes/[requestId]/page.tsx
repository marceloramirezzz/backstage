import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPool } from "@/db/pool.ts";
import { BOOKING_STATUS_LABELS, EVENT_TYPE_LABELS, URGENCY_LABELS } from "@/lib/booking.ts";
import { requireUser } from "@/lib/session.ts";
import { getBookingRequest } from "@/services/booking-requests.ts";
import { ServiceError } from "@/services/errors.ts";
import { getPermissions } from "@/services/permissions.ts";

export const metadata: Metadata = { title: "Solicitud · Backstage" };

// One Solicitud with everything the client wrote. Only for those who manage bookings.
export default async function BookingRequestDetail({
  params,
}: PageProps<"/p/[projectId]/solicitudes/[requestId]">) {
  const user = await requireUser();
  const { projectId, requestId } = await params;
  const pool = getPool();
  if (!(await getPermissions(pool, user, projectId)).manageBookings) notFound();
  const request = await getBookingRequest(pool, user, projectId, requestId).catch((err) => {
    if (err instanceof ServiceError && err.code === "not_found") notFound();
    throw err;
  });

  const rows: [string, string | null][] = [
    ["Teléfono", request.phone],
    ["Correo", request.email],
    ["Tipo de evento", EVENT_TYPE_LABELS[request.eventType]],
    ["Fecha del evento", request.eventDate],
    ["Lugar", request.venue],
    ["Ubicación", request.location],
    ["Invitados", request.guests === null ? null : String(request.guests)],
    ["Urgencia", request.urgency ? URGENCY_LABELS[request.urgency] : null],
    ["Estilo musical", request.musicStyle],
  ];

  return (
    <main className="flex min-w-0 flex-col gap-6 p-6 max-desktop:px-4">
      <Link href={`/p/${projectId}/solicitudes`} className="text-[13px]/[18px] text-ink-muted">
        ← Solicitudes
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="m-0 text-display">{request.clientName}</h1>
        <span className="rounded-pill border border-line-control px-2 py-0.5 text-[12px]/[16px]">
          {BOOKING_STATUS_LABELS[request.status]}
        </span>
      </div>
      <dl className="m-0 grid max-w-[640px] grid-cols-[160px_minmax(0,1fr)] gap-x-4 gap-y-2 text-[14px]/[20px] max-sm:grid-cols-1">
        {rows
          .filter((r): r is [string, string] => r[1] !== null)
          .map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-ink-muted">{label}</dt>
              <dd className="m-0 break-words">{value}</dd>
            </div>
          ))}
      </dl>
      <section className="flex max-w-[640px] flex-col gap-2">
        <h2 className="m-0 text-[18px]/[24px] font-semibold">Descripción</h2>
        <p className="m-0 whitespace-pre-wrap break-words text-[14px]/[20px]">{request.description}</p>
      </section>
    </main>
  );
}
