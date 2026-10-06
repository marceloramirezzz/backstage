"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Field, Input } from "@/components/ui/field.tsx";
import { LANDING_SERVICES } from "@/lib/landing-services.ts";
import type { LandingProfile } from "@/services/landing-page.ts";
import { saveProfile, type ListActionState } from "./actions.ts";

// The hero, services and about text. Leave a field blank to clear it. Edits
// are live once saved.
export function ProfileForm({
  projectId,
  profile,
  limits,
}: {
  projectId: string;
  profile: LandingProfile;
  limits: { tagline: number; genre: number; travelArea: number; about: number; years: number };
}) {
  const [state, action, pending] = useActionState<ListActionState, FormData>(saveProfile, { done: 0 });

  return (
    <form action={action} className="flex max-w-[520px] flex-col gap-4">
      <input type="hidden" name="projectId" value={projectId} />
      <Field label="Frase de presentación">
        <Input name="tagline" defaultValue={profile.tagline ?? ""} maxLength={limits.tagline} />
      </Field>
      <Field label="Género">
        <Input name="genre" defaultValue={profile.genre ?? ""} maxLength={limits.genre} placeholder="Cumbia, rock…" />
      </Field>
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="mb-1 p-0 text-[12px]/[16px] font-medium text-ink-muted">Servicios</legend>
        {Object.entries(LANDING_SERVICES).map(([id, label]) => (
          <label key={id} className="flex items-center gap-2.5 text-[14px]/[20px]">
            <input
              type="checkbox"
              name="services"
              value={id}
              defaultChecked={profile.services.includes(id)}
              className="size-4 accent-spotlight"
            />
            {label}
          </label>
        ))}
      </fieldset>
      <Field label="Años de trayectoria">
        <Input
          name="yearsActive"
          type="number"
          inputMode="numeric"
          min={0}
          max={limits.years}
          step={1}
          defaultValue={profile.yearsActive ?? ""}
        />
      </Field>
      <Field label="Zona de viaje">
        <Input
          name="travelArea"
          defaultValue={profile.travelArea ?? ""}
          maxLength={limits.travelArea}
          placeholder="Asunción y alrededores"
        />
      </Field>
      <Field label="Sobre nosotros">
        <textarea
          name="about"
          rows={5}
          defaultValue={profile.about ?? ""}
          maxLength={limits.about}
          className="w-full rounded-md border border-line-control bg-bg-2 px-3 py-2 text-[14px]/[20px] text-ink"
        />
      </Field>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Guardando…" : "Guardar"}
        </Button>
        {state.error && <span role="alert" className="text-[13px]/[18px] text-status-cancelled">{state.error}</span>}
        {state.done > 0 && !state.error && !pending && (
          <span role="status" className="text-[13px]/[18px] text-ink-muted">Guardado</span>
        )}
      </div>
    </form>
  );
}
