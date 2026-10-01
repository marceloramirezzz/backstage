"use client";

import { useState, useTransition } from "react";
import { resetEventSplit } from "@/app/p/[projectId]/eventos/split-actions.ts";
import { FormMessage } from "@/components/auth-screen.tsx";
import { Button } from "@/components/ui/button.tsx";

// Drops the Evento's own Reparto, back to the Banda's default.
export function UseDefaultSplitButton({ projectId, eventId }: { projectId: string; eventId: string }) {
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => startTransition(async () => setError((await resetEventSplit(projectId, eventId)).error))}
      >
        Usar el reparto de la banda
      </Button>
      {error && <FormMessage tone="error">{error}</FormMessage>}
    </>
  );
}
