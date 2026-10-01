"use client";

import { CircleDollarSign, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setEventStatus } from "@/app/p/[projectId]/eventos/actions.ts";
import { FormMessage } from "@/components/auth-screen.tsx";
import {
  DeleteEventDialog,
  EventDialog,
  type SetlistOption,
} from "@/components/events/event-dialogs.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Select } from "@/components/ui/field.tsx";
import { iconProps } from "@/components/ui/icon-props.ts";
import { STATUS_OPTIONS } from "@/lib/event-status.ts";
import type { Event, EventStatus } from "@/services/events.ts";

// What a Member who can edit events does from the Evento's page: move its
// status, edit it, mark it paid or delete it.
export function EventControls({
  projectId,
  event,
  setlists,
  canSetPay,
  canDelete,
}: {
  projectId: string;
  event: Event;
  setlists: SetlistOption[];
  canSetPay: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"edit" | "delete" | null>(null);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const move = (status: EventStatus) =>
    startTransition(async () => {
      setError((await setEventStatus(projectId, event.id, status)).error);
    });
  const close = () => setDialog(null);

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-[13px]/[18px] text-ink-muted">
          Estado
          <Select
            pill
            value={event.status}
            disabled={pending}
            onChange={(e) => move(e.target.value as EventStatus)}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </label>
        <Button variant="secondary" onClick={() => setDialog("edit")}>
          <Pencil {...iconProps} />
          Editar
        </Button>
        {canDelete && (
          <Button variant="danger" onClick={() => setDialog("delete")}>
            <Trash2 {...iconProps} />
            Eliminar
          </Button>
        )}
        {event.status !== "paid" && (
          <Button variant="primary" disabled={pending} onClick={() => move("paid")}>
            <CircleDollarSign {...iconProps} />
            Marcar como pagado
          </Button>
        )}
      </div>
      {error && <FormMessage tone="error">{error}</FormMessage>}
      <EventDialog
        projectId={projectId}
        event={event}
        setlists={setlists}
        canSetPay={canSetPay}
        open={dialog === "edit"}
        onClose={close}
      />
      <DeleteEventDialog
        projectId={projectId}
        event={event}
        open={dialog === "delete"}
        onClose={close}
        onDeleted={() => router.push(`/p/${projectId}/calendario`)}
      />
    </div>
  );
}
