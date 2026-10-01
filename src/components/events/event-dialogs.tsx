"use client";

import { Trash2 } from "lucide-react";
import { useActionState, useEffect, useEffectEvent } from "react";
import {
  removeEvent,
  saveEvent,
  type EventActionState,
  type EventFormState,
} from "@/app/p/[projectId]/eventos/actions.ts";
import { FormMessage } from "@/components/auth-screen.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Dialog } from "@/components/ui/dialog.tsx";
import { Field, Input, Select } from "@/components/ui/field.tsx";
import { iconProps } from "@/components/ui/icon-props.ts";
import { STATUS_OPTIONS } from "@/lib/event-status.ts";
import { submitKeepingFields } from "@/lib/submit-keeping-fields.ts";
import type { Event } from "@/services/events.ts";

export interface SetlistOption {
  id: string;
  name: string;
}

// Adds an Evento, or edits `event`. Creating opens the new Evento's page.
export function EventDialog({
  projectId,
  event,
  defaultDate,
  setlists,
  canSetPay,
  open,
  onClose,
}: {
  projectId: string;
  event?: Event;
  // The day a new Evento starts on.
  defaultDate?: string;
  // The template Setlists an Evento can copy.
  setlists: SetlistOption[];
  // Whether the User may also set the Cachet.
  canSetPay: boolean;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={event ? "Editar evento" : "Nuevo evento"}>
      <EventForm
        projectId={projectId}
        event={event}
        defaultDate={defaultDate}
        setlists={setlists}
        canSetPay={canSetPay}
        onClose={onClose}
      />
    </Dialog>
  );
}

function EventForm({
  projectId,
  event,
  defaultDate,
  setlists,
  canSetPay,
  onClose,
}: {
  projectId: string;
  event?: Event;
  defaultDate?: string;
  setlists: SetlistOption[];
  canSetPay: boolean;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState<EventFormState, FormData>(saveEvent, {
    saved: 0,
  });

  const onSaved = useEffectEvent(onClose);
  useEffect(() => {
    if (state.saved) onSaved();
  }, [state.saved]);

  const minutes = event?.durationMinutes ?? 180;
  const copied = event?.setlist;
  return (
    <form onSubmit={submitKeepingFields(action)} className="flex flex-col gap-4">
      <input type="hidden" name="projectId" value={projectId} />
      {event && <input type="hidden" name="eventId" value={event.id} />}
      <Field label="Nombre">
        <Input
          name="name"
          defaultValue={event?.name}
          placeholder="Ej.: Casamiento Ríos"
          required
          data-autofocus
        />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Fecha">
          <Input name="date" type="date" defaultValue={event?.date ?? defaultDate} required />
        </Field>
        <Field label="Hora de inicio (opcional)">
          <Input
            name="startTime"
            type="time"
            defaultValue={event?.startTime ?? ""}
            className="font-mono"
          />
        </Field>
      </div>
      <fieldset className="m-0 grid grid-cols-2 gap-4 border-0 p-0">
        <legend className="sr-only">Duración del evento</legend>
        <Field label="Duración: horas">
          <Input
            name="hours"
            type="number"
            inputMode="numeric"
            min={0}
            max={48}
            defaultValue={Math.floor(minutes / 60)}
            required
            className="font-mono"
          />
        </Field>
        <Field label="Minutos">
          <Input
            name="minutes"
            type="number"
            inputMode="numeric"
            min={0}
            max={59}
            defaultValue={minutes % 60}
            required
            className="font-mono"
          />
        </Field>
      </fieldset>
      <Field label="Lugar (opcional)">
        <Input name="location" defaultValue={event?.location ?? ""} placeholder="Ej.: Salón Las Palmeras" />
      </Field>
      <div className="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
        {canSetPay && (
          <Field label="Cachet (Gs.)">
            <Input
              name="pay"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              defaultValue={event?.pay ?? 0}
              required
              className="font-mono"
            />
          </Field>
        )}
        <Field label="Estado">
          <Select name="status" defaultValue={event?.status ?? "pending"}>
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field
        label="Setlist"
        hint="Se copia al elegirla: editar la plantilla después no cambia este evento."
      >
        <Select name="setlistId" defaultValue={copied ? "keep" : ""}>
          {copied ? (
            <>
              <option value="keep">Mantener la copia actual ({copied.name})</option>
              <option value="none">Sin setlist</option>
            </>
          ) : (
            <option value="">Sin setlist</option>
          )}
          {setlists.map((setlist) => (
            <option key={setlist.id} value={setlist.id}>
              {copied ? `Copiar de nuevo: ${setlist.name}` : setlist.name}
            </option>
          ))}
        </Select>
      </Field>
      <label className="flex items-center gap-2 text-[14px]/[20px]">
        <input
          type="checkbox"
          name="isPublic"
          defaultChecked={event?.isPublic ?? false}
          className="size-4 accent-spotlight"
        />
        Mostrar en la página pública
      </label>
      {state.error && <FormMessage tone="error">{state.error}</FormMessage>}
      <div className="flex justify-end gap-3">
        <Button variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Guardando…" : event ? "Guardar cambios" : "Crear evento"}
        </Button>
      </div>
    </form>
  );
}

// Confirms deleting an Evento; `onDeleted` runs once it's gone.
export function DeleteEventDialog({
  projectId,
  event,
  open,
  onClose,
  onDeleted,
}: {
  projectId: string;
  event: Pick<Event, "id" | "name" | "status">;
  open: boolean;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} title="Eliminar evento">
      <DeleteEventForm
        projectId={projectId}
        event={event}
        onClose={onClose}
        onDeleted={onDeleted ?? onClose}
      />
    </Dialog>
  );
}

function DeleteEventForm({
  projectId,
  event,
  onClose,
  onDeleted,
}: {
  projectId: string;
  event: Pick<Event, "id" | "name" | "status">;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [state, action, pending] = useActionState<EventActionState, FormData>(removeEvent, {
    done: 0,
  });

  const onDone = useEffectEvent(onDeleted);
  useEffect(() => {
    if (state.done) onDone();
  }, [state.done]);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="eventId" value={event.id} />
      <p className="m-0 text-[14px]/[20px] text-ink-muted">
        ¿Eliminar <span className="font-medium text-ink">{event.name}</span>? No se puede
        deshacer{event.status === "paid" ? " y desaparece de todos los totales" : ""}.
      </p>
      {state.error && <FormMessage tone="error">{state.error}</FormMessage>}
      <div className="flex justify-end gap-3">
        <Button variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" variant="danger" disabled={pending}>
          <Trash2 {...iconProps} />
          {pending ? "Eliminando…" : "Eliminar"}
        </Button>
      </div>
    </form>
  );
}
