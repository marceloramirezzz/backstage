"use client";

import { Mail } from "lucide-react";
import { useState, useTransition } from "react";
import { FormMessage } from "@/components/auth-screen.tsx";
import { Button } from "@/components/ui/button.tsx";
import { iconProps } from "@/components/ui/icon-props.ts";
import { notifyEventAttendance } from "../notify-actions.ts";

// Emails the date, time and place to everyone in Asistencia. Asks first: an email can't be taken back.
export function NotifyAttendance({ projectId, eventId }: { projectId: string; eventId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<{ error?: string; sent?: number }>();
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col items-end gap-2">
      {confirming ? (
        <div className="flex flex-wrap items-center justify-end gap-2 text-[14px]/[20px]">
          <span>¿Enviar fecha, hora y lugar a quienes están en la asistencia?</span>
          <Button
            variant="primary"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setResult(await notifyEventAttendance(projectId, eventId));
                setConfirming(false);
              })
            }
          >
            Sí, avisar
          </Button>
          <Button variant="ghost" onClick={() => setConfirming(false)}>
            Cancelar
          </Button>
        </div>
      ) : (
        <Button
          variant="secondary"
          onClick={() => {
            setResult(undefined);
            setConfirming(true);
          }}
        >
          <Mail {...iconProps} />
          Avisar a la banda
        </Button>
      )}
      {result?.error && <FormMessage tone="error">{result.error}</FormMessage>}
      {result?.sent !== undefined && (
        <FormMessage tone="info">
          {result.sent === 1 ? "Avisamos a 1 miembro." : `Avisamos a ${result.sent} miembros.`}
        </FormMessage>
      )}
    </div>
  );
}
