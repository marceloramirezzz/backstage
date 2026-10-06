"use client";

import { Trash2 } from "lucide-react";
import { useActionState, useEffect, useEffectEvent } from "react";
import {
  removeRehearsal,
  saveRehearsal,
  type RehearsalActionState,
  type RehearsalFormState,
} from "@/app/p/[projectId]/ensayos/actions.ts";
import { FormMessage } from "@/components/auth-screen.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Dialog } from "@/components/ui/dialog.tsx";
import { Field, Input } from "@/components/ui/field.tsx";
import { iconProps } from "@/components/ui/icon-props.ts";
import { submitKeepingFields } from "@/lib/submit-keeping-fields.ts";
import type { Rehearsal } from "@/services/rehearsals.ts";

// Adds an Ensayo, or edits `rehearsal`. Only a new one offers to email the Miembros.
export function RehearsalDialog({
  projectId,
  rehearsal,
  defaultDate,
  open,
  onClose,
}: {
  projectId: string;
  rehearsal?: Rehearsal;
  // The day a new Ensayo starts on.
  defaultDate?: string;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={rehearsal ? "Editar ensayo" : "Nuevo ensayo"}>
      <RehearsalForm
        projectId={projectId}
        rehearsal={rehearsal}
        defaultDate={defaultDate}
        onClose={onClose}
      />
    </Dialog>
  );
}

function RehearsalForm({
  projectId,
  rehearsal,
  defaultDate,
  onClose,
}: {
  projectId: string;
  rehearsal?: Rehearsal;
  defaultDate?: string;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState<RehearsalFormState, FormData>(saveRehearsal, {
    saved: 0,
  });
  const onSaved = useEffectEvent(onClose);
  useEffect(() => {
    if (state.saved) onSaved();
  }, [state.saved]);

  return (
    <form onSubmit={submitKeepingFields(action)} className="flex flex-col gap-4">
      <input type="hidden" name="projectId" value={projectId} />
      {rehearsal && <input type="hidden" name="rehearsalId" value={rehearsal.id} />}
      <Field label="Fecha">
        <Input name="date" type="date" defaultValue={rehearsal?.date ?? defaultDate} required data-autofocus />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Hora de inicio">
          <Input
            name="startTime"
            type="time"
            defaultValue={rehearsal?.startTime ?? ""}
            required
            className="font-mono"
          />
        </Field>
        <Field label="Hora de fin">
          <Input
            name="endTime"
            type="time"
            defaultValue={rehearsal?.endTime ?? ""}
            required
            className="font-mono"
          />
        </Field>
      </div>
      <Field label="Lugar (opcional)">
        <Input name="location" defaultValue={rehearsal?.location ?? ""} placeholder="Ej.: Local de ensayo" />
      </Field>
      <Field label="Notas (opcional)">
        <Input name="notes" defaultValue={rehearsal?.notes ?? ""} placeholder="Ej.: Traer cables" />
      </Field>
      {!rehearsal && (
        <label className="flex items-center gap-2 text-[14px]/[20px]">
          <input type="checkbox" name="notify" className="size-4 accent-spotlight" />
          Avisar por email a los miembros
        </label>
      )}
      {state.error && <FormMessage tone="error">{state.error}</FormMessage>}
      <div className="flex justify-end gap-3">
        <Button variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Guardando…" : rehearsal ? "Guardar cambios" : "Crear ensayo"}
        </Button>
      </div>
    </form>
  );
}

// Confirms deleting an Ensayo.
export function DeleteRehearsalDialog({
  projectId,
  rehearsal,
  open,
  onClose,
}: {
  projectId: string;
  rehearsal: Rehearsal;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} title="Eliminar ensayo">
      <DeleteRehearsalForm projectId={projectId} rehearsal={rehearsal} onClose={onClose} />
    </Dialog>
  );
}

function DeleteRehearsalForm({
  projectId,
  rehearsal,
  onClose,
}: {
  projectId: string;
  rehearsal: Rehearsal;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState<RehearsalActionState, FormData>(removeRehearsal, {
    done: 0,
  });
  const onDone = useEffectEvent(onClose);
  useEffect(() => {
    if (state.done) onDone();
  }, [state.done]);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="rehearsalId" value={rehearsal.id} />
      <p className="m-0 text-[14px]/[20px] text-ink-muted">
        ¿Eliminar el ensayo del <span className="font-medium text-ink">{rehearsal.date}</span>? No se
        puede deshacer.
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
