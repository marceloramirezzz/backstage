"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Field, Input } from "@/components/ui/field.tsx";
import type { MemberPublicProfile } from "@/services/landing-page.ts";
import { savePublicProfile, type FormState } from "./actions.ts";

// The Member's own entry in "Sobre nosotros" on the public page. Nobody else,
// Admins included, can edit it or opt them in; edits are live once saved.
export function PublicProfileForm({
  projectId,
  profile,
  limits,
}: {
  projectId: string;
  profile: MemberPublicProfile;
  limits: { name: number; bio: number };
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(savePublicProfile, { done: 0 });

  return (
    <form action={action} className="flex flex-col gap-4 px-4 pb-4">
      <input type="hidden" name="projectId" value={projectId} />
      <p className="m-0 text-[13px]/[18px] text-ink-muted">
        Si lo activás, tu nombre y tu bio aparecen en la página pública de la banda. Solo vos podés cambiarlo.
      </p>
      <label className="flex items-center gap-2.5 text-[14px]/[20px]">
        <input
          type="checkbox"
          name="showOnAbout"
          defaultChecked={profile.showOnAbout}
          className="size-4 accent-spotlight"
        />
        Mostrarme en la página pública
      </label>
      <Field label="Nombre público">
        <Input name="publicName" defaultValue={profile.publicName ?? ""} maxLength={limits.name} />
      </Field>
      <Field label="Bio">
        <textarea
          name="publicBio"
          rows={3}
          defaultValue={profile.publicBio ?? ""}
          maxLength={limits.bio}
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
