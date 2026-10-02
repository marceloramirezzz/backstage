"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Field, Input } from "@/components/ui/field.tsx";
import { saveLanding, type LandingActionState } from "./actions.ts";

// Turn the public page on and choose its address. Edits are live.
export function LandingForm({
  projectId,
  enabled,
  slug,
  origin,
}: {
  projectId: string;
  enabled: boolean;
  slug: string;
  origin: string;
}) {
  const [state, action, pending] = useActionState<LandingActionState, FormData>(saveLanding, {
    slug,
    done: 0,
  });

  return (
    <form action={action} className="flex max-w-[520px] flex-col gap-4">
      <input type="hidden" name="projectId" value={projectId} />
      <label className="flex items-center gap-2.5 text-[14px]/[20px]">
        <input type="checkbox" name="enabled" defaultChecked={enabled} className="size-4 accent-spotlight" />
        Mostrar la página pública
      </label>
      <Field
        label="Dirección"
        error={state.error}
        hint={`${origin}/${state.slug || slug || "tu-banda"}`}
      >
        <Input
          key={state.done}
          name="slug"
          defaultValue={state.slug || slug}
          placeholder="los-del-valle"
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          maxLength={40}
        />
      </Field>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Guardando…" : "Guardar"}
        </Button>
        {state.done > 0 && !state.error && !pending && (
          <span role="status" className="text-[13px]/[18px] text-ink-muted">Guardado</span>
        )}
      </div>
    </form>
  );
}
