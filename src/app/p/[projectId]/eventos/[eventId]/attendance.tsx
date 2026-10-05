"use client";

import { Plus, X } from "lucide-react";
import {
  useActionState,
  useEffect,
  useState,
  useTransition,
} from "react";
import {
  addEventGuest,
  removeEventGuest,
  setMemberAttending,
} from "@/app/p/[projectId]/eventos/attendance-actions.ts";
import { FormMessage } from "@/components/auth-screen.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Dialog } from "@/components/ui/dialog.tsx";
import { Field, Input } from "@/components/ui/field.tsx";
import { MoneyInput } from "@/components/ui/money-input.tsx";
import { iconProps } from "@/components/ui/icon-props.ts";
import { initials } from "@/lib/initials.ts";
import { formatGuaranies } from "@/lib/format.ts";
import type { Attendance } from "@/services/attendance.ts";

// Who played: the Members (all ticked until someone unticks them) and the
// Suplentes. Only those who can edit the Event change it; the services enforce
// it.
export function AttendanceSection({
  projectId,
  eventId,
  attendance,
  canEdit,
  canSetAmount,
}: {
  projectId: string;
  eventId: string;
  attendance: Attendance;
  canEdit: boolean;
  canSetAmount: boolean;
}) {
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const { members, guests } = attendance;
  const played = members.filter((m) => m.attending).length + guests.length;

  const applyChange = (act: () => Promise<{ error?: string }>) =>
    startTransition(async () => setError((await act()).error));

  return (
    <section
      aria-labelledby="asistencia-title"
      className="flex flex-col gap-3 rounded-lg border border-line bg-bg-1 p-3"
    >
      <div className="flex items-center justify-between gap-4">
        <h2 id="asistencia-title" className="m-0 text-[12px]/[16px] font-semibold uppercase tracking-wide text-ink-muted">
          Asistencia y suplentes
        </h2>
        <span className="text-[13px]/[18px] text-ink-muted">
          {played} de {members.length + guests.length} asisten
        </span>
      </div>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {members.map((m) => (
          <li key={m.userId}>
            <label
              className={`flex items-center gap-2.5 text-[14px]/[20px] ${m.attending ? "" : "text-ink-muted"}`}
            >
              <input
                type="checkbox"
                className="size-4 accent-spotlight"
                checked={m.attending}
                disabled={!canEdit || pending}
                onChange={(e) =>
                  applyChange(() =>
                    setMemberAttending(
                      projectId,
                      eventId,
                      m.userId,
                      e.target.checked,
                    ),
                  )
                }
              />
              <span
                aria-hidden
                className="inline-grid size-7 flex-none place-items-center rounded-pill bg-bg-3 text-[12px] font-semibold text-ink"
              >
                {initials(m.displayName)}
              </span>
              <span className="min-w-0 grow truncate">{m.displayName}</span>
              <span className="text-[12px]/[16px] text-ink-muted">
                {m.roleName}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-3 border-t border-line pt-3 empty:hidden">
        <div className={`flex items-center gap-3 empty:hidden ${guests.length ? "justify-between" : "justify-end"}`}>
          {guests.length > 0 && (
            <h3 className="m-0 text-[13px]/[18px] font-medium text-ink-muted">
              Suplentes
            </h3>
          )}
          {canEdit && (
            <GuestDialogButton
              projectId={projectId}
              eventId={eventId}
              canSetAmount={canSetAmount}
            />
          )}
        </div>
        {guests.length ? (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {guests.map((g) => (
              <li
                key={g.id}
                className="flex items-center gap-2.5 text-[14px]/[20px]"
              >
                <span className="min-w-0 grow truncate">{g.name}</span>
                {g.amount !== null && (
                  <span className="font-mono text-[13px]">
                    {formatGuaranies(g.amount)}
                  </span>
                )}
                {canEdit && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="min-h-11 min-w-11 justify-center"
                    aria-label={`Quitar a ${g.name}`}
                    disabled={pending}
                    onClick={() =>
                      applyChange(() =>
                        removeEventGuest(projectId, eventId, g.id),
                      )
                    }
                  >
                    <X {...iconProps} />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {error && <FormMessage tone="error">{error}</FormMessage>}
    </section>
  );
}

function GuestDialogButton({
  projectId,
  eventId,
  canSetAmount,
}: {
  projectId: string;
  eventId: string;
  canSetAmount: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <Plus {...iconProps} />
        Agregar suplente
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Agregar suplente">
        <GuestForm
          projectId={projectId}
          eventId={eventId}
          canSetAmount={canSetAmount}
          onDone={() => setOpen(false)}
        />
      </Dialog>
    </>
  );
}

function GuestForm({
  projectId,
  eventId,
  canSetAmount,
  onDone,
}: {
  projectId: string;
  eventId: string;
  canSetAmount: boolean;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(addEventGuest, { done: 0 });
  useEffect(() => {
    if (state.done) onDone();
  }, [state.done]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="eventId" value={eventId} />
      <Field label="Nombre del suplente">
        <Input name="name" required autoComplete="off" data-autofocus />
      </Field>
      {canSetAmount && (
        <Field label="Monto (Gs.)">
          <MoneyInput
            name="amount"
            placeholder="0"
          />
        </Field>
      )}
      {state.error && <FormMessage tone="error">{state.error}</FormMessage>}
      <Button type="submit" disabled={pending}>
        Agregar suplente
      </Button>
    </form>
  );
}
