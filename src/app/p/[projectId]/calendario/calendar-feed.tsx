"use client";

import { RefreshCw } from "lucide-react";
import { useActionState } from "react";
import { FormMessage } from "@/components/auth-screen.tsx";
import { Button } from "@/components/ui/button.tsx";
import { iconProps } from "@/components/ui/icon-props.ts";
import { regenerateFeed, type FeedFormState } from "./actions.ts";

// The Admin's view of the Banda's calendar feed: the secret address to
// subscribe to from Google Calendar and the like, and a way to replace it.
export function CalendarFeed({ projectId, url }: { projectId: string; url: string }) {
  const [state, action, pending] = useActionState<FeedFormState, FormData>(regenerateFeed, {});
  return (
    <section aria-labelledby="feed-title" className="flex flex-col gap-3 rounded-lg border border-line p-4">
      <h2 id="feed-title" className="m-0 text-[16px]/[24px]">
        Suscribirse al calendario
      </h2>
      <p className="m-0 text-[14px]/[20px] text-ink-muted">
        Pegá este enlace en Google Calendar u otra app para ver los eventos y ensayos (solo títulos,
        horarios y lugares). Cualquiera que lo tenga puede verlos: si se filtró, generá uno nuevo y el
        anterior deja de funcionar.
      </p>
      <input
        readOnly
        aria-label="Enlace del calendario"
        value={url}
        onFocus={(e) => e.currentTarget.select()}
        className="h-9 w-full min-w-0 rounded-md border border-line-control bg-bg-1 px-3 text-[13px] text-ink"
      />
      <form action={action} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="projectId" value={projectId} />
        <Button type="submit" variant="secondary" disabled={pending}>
          <RefreshCw {...iconProps} />
          Generar enlace nuevo
        </Button>
        {state.error && <FormMessage tone="error">{state.error}</FormMessage>}
      </form>
    </section>
  );
}
