"use client";

import { Trash2 } from "lucide-react";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { FormMessage } from "@/components/auth-screen.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Field, Select } from "@/components/ui/field.tsx";
import { iconProps } from "@/components/ui/icon-props.ts";
import { BOOKING_STATUS_LABELS, BOOKING_STATUSES, type BookingStatus } from "@/lib/booking.ts";
import { addRequestNote, changeRequestStatus, deleteRequest } from "./actions.ts";

// Moves the Solicitud to any status, in any direction.
export function StatusPicker({
  projectId,
  requestId,
  status,
}: {
  projectId: string;
  requestId: string;
  status: BookingStatus;
}) {
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <Field label="Estado" className="w-56">
        <Select
          value={status}
          disabled={pending}
          onChange={(e) =>
            startTransition(async () =>
              setError((await changeRequestStatus(projectId, requestId, e.target.value as BookingStatus)).error),
            )
          }
        >
          {BOOKING_STATUSES.map((s) => (
            <option key={s} value={s}>
              {BOOKING_STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
      </Field>
      {error && <FormMessage tone="error">{error}</FormMessage>}
    </div>
  );
}

// Adds an internal note; clients never see these.
export function NoteForm({ projectId, requestId }: { projectId: string; requestId: string }) {
  const [state, action, pending] = useActionState(addRequestNote, { done: 0 });
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.done) ref.current?.reset();
  }, [state.done]);
  return (
    <form ref={ref} action={action} className="flex flex-col gap-2">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="requestId" value={requestId} />
      <Field label="Nueva nota">
        <textarea
          name="body"
          required
          rows={3}
          maxLength={4000}
          className="w-full rounded-md border border-line-control bg-bg-2 p-3 text-[14px]/[20px] text-ink"
        />
      </Field>
      <div>
        <Button type="submit" variant="secondary" disabled={pending}>
          Agregar nota
        </Button>
      </div>
      {state.error && <FormMessage tone="error">{state.error}</FormMessage>}
    </form>
  );
}

// Deleting asks twice: the request and its notes are gone for good.
export function DeleteRequest({ projectId, requestId }: { projectId: string; requestId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2 text-[14px]/[20px]">
          <span>¿Eliminar la solicitud y sus notas? No se puede deshacer.</span>
          <Button
            variant="danger"
            disabled={pending}
            onClick={() => startTransition(async () => setError((await deleteRequest(projectId, requestId))?.error))}
          >
            Sí, eliminar
          </Button>
          <Button variant="ghost" onClick={() => setConfirming(false)}>
            Cancelar
          </Button>
        </div>
      ) : (
        <div>
          <Button variant="danger" onClick={() => setConfirming(true)}>
            <Trash2 {...iconProps} />
            Eliminar solicitud
          </Button>
        </div>
      )}
      {error && <FormMessage tone="error">{error}</FormMessage>}
    </div>
  );
}
