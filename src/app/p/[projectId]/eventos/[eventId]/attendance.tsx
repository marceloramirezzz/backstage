"use client";

import { Plus, X } from "lucide-react";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import {
  addEventGuest,
  removeEventGuest,
  setMemberAttending,
} from "@/app/p/[projectId]/eventos/attendance-actions.ts";
import { FormMessage } from "@/components/auth-screen.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Field, Input } from "@/components/ui/field.tsx";
import { iconProps } from "@/components/ui/icon-props.ts";
import { initials } from "@/lib/initials.ts";
import { formatGuaranies } from "@/lib/format.ts";
import type { Attendance } from "@/services/attendance.ts";

// Who played: the Members (all ticked until someone unticks them) and the
// Suplentes. Only those who can edit the Event change it, and never their own
// row; the services enforce both.
export function AttendanceSection({
  projectId,
  eventId,
  attendance,
  currentUserId,
  canEdit,
  canSetAmount,
}: {
  projectId: string;
  eventId: string;
  attendance: Attendance;
  currentUserId: string;
  canEdit: boolean;
  canSetAmount: boolean;
}) {
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const { members, guests } = attendance;
  const played = members.filter((m) => m.attending).length + guests.length;

  const change = (act: () => Promise<{ error?: string }>) =>
    startTransition(async () => setError((await act()).error));

  return (
    <section
      aria-labelledby="asistencia-title"
      className="flex flex-col gap-4 rounded-lg border border-line bg-bg-1 p-4"
    >
      <div className="flex items-center justify-between gap-4">
        <h2 id="asistencia-title" className="m-0 text-heading">
          Asistencia y suplentes
        </h2>
        <span className="text-[13px]/[18px] text-ink-muted">
          {played} de {members.length + guests.length} asisten
        </span>
      </div>
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {members.map((m) => {
          const own = m.userId === currentUserId;
          return (
            <li key={m.userId}>
              <label
                className={`flex items-center gap-2.5 text-[14px]/[20px] ${m.attending ? "" : "text-ink-muted"}`}
              >
                <input
                  type="checkbox"
                  className="size-4 accent-spotlight"
                  checked={m.attending}
                  disabled={!canEdit || own || pending}
                  onChange={(e) =>
                    change(() => setMemberAttending(projectId, eventId, m.userId, e.target.checked))
                  }
                />
                <span
                  aria-hidden
                  className="inline-grid size-7 flex-none place-items-center rounded-pill bg-bg-3 text-[12px] font-semibold text-ink"
                >
                  {initials(m.displayName)}
                </span>
                <span className="min-w-0 grow truncate">{m.displayName}</span>
                <span className="text-[12px]/[16px] text-ink-muted">{m.roleName}</span>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-col gap-3 border-t border-line pt-4">
        <h3 className="m-0 text-[13px]/[18px] font-medium text-ink-muted">Suplentes</h3>
        {guests.length ? (
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {guests.map((g) => (
              <li key={g.id} className="flex items-center gap-2.5 text-[14px]/[20px]">
                <span className="min-w-0 grow truncate">{g.name}</span>
                {g.amount !== null && (
                  <span className="font-mono text-[13px]">{formatGuaranies(g.amount)}</span>
                )}
                {canEdit && (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Quitar a ${g.name}`}
                    disabled={pending}
                    onClick={() => change(() => removeEventGuest(projectId, eventId, g.id))}
                  >
                    <X {...iconProps} />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 text-[14px]/[20px] text-ink-muted">
            Sin suplentes. Agregá a quien tocó en lugar de un miembro.
          </p>
        )}
        {canEdit && (
          <GuestForm projectId={projectId} eventId={eventId} canSetAmount={canSetAmount} />
        )}
      </div>
      {error && <FormMessage tone="error">{error}</FormMessage>}
    </section>
  );
}

function GuestForm({
  projectId,
  eventId,
  canSetAmount,
}: {
  projectId: string;
  eventId: string;
  canSetAmount: boolean;
}) {
  const [state, action, pending] = useActionState(addEventGuest, { done: 0 });
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.done) ref.current?.reset();
  }, [state.done]);

  return (
    <form ref={ref} action={action} className="flex flex-col gap-2">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="eventId" value={eventId} />
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Nombre del suplente" className="min-w-40 grow">
          <Input name="name" required autoComplete="off" />
        </Field>
        {canSetAmount && (
          <Field label="Monto (Gs.)" className="w-36">
            <Input name="amount" type="number" inputMode="numeric" min={0} step={1} placeholder="0" />
          </Field>
        )}
        <Button type="submit" variant="secondary" disabled={pending}>
          <Plus {...iconProps} />
          Agregar suplente
        </Button>
      </div>
      {state.error && <FormMessage tone="error">{state.error}</FormMessage>}
    </form>
  );
}
