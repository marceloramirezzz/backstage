import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPool } from "@/db/pool.ts";
import { BOOKING_STATUS_LABELS, EVENT_TYPE_LABELS } from "@/lib/booking.ts";
import { requireUser } from "@/lib/session.ts";
import { listBookingRequests } from "@/services/booking-requests.ts";
import { getPermissions } from "@/services/permissions.ts";

export const metadata: Metadata = { title: "Solicitudes · Backstage" };

// The Banda's Solicitudes, newest first. Only for those who manage bookings.
export default async function BookingRequests({ params }: PageProps<"/p/[projectId]/solicitudes">) {
  const user = await requireUser();
  const { projectId } = await params;
  const pool = getPool();
  if (!(await getPermissions(pool, user, projectId)).manageBookings) notFound();
  const requests = await listBookingRequests(pool, user, projectId);

  return (
    <main className="flex min-w-0 flex-col gap-6 p-6 max-desktop:px-4">
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-display">Solicitudes</h1>
        <p className="m-0 text-[14px]/[20px] text-ink-muted">
          Pedidos de contratación que llegan desde la página pública.
        </p>
      </div>
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
                  <span className="rounded-pill border border-line-control px-2 py-0.5">
                    {BOOKING_STATUS_LABELS[r.status]}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 text-ink-muted">Todavía no recibiste solicitudes.</p>
      )}
    </main>
  );
}
