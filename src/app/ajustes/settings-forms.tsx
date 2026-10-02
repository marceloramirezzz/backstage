"use client";

import { useActionState, useOptimistic, useTransition } from "react";
import { FormMessage } from "@/components/auth-screen.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Field, Input } from "@/components/ui/field.tsx";
import { Segmented } from "@/components/ui/segmented.tsx";
import type { Theme } from "@/services/accounts.ts";
import { saveDisplayName, savePassword, saveTheme, type SettingsState } from "./actions.ts";

const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: "dark", label: "Oscuro" },
  { value: "light", label: "Claro" },
  { value: "system", label: "Sistema" },
];

function Outcome({ state, done }: { state: SettingsState; done: string }) {
  if (state.error) return <FormMessage tone="error">{state.error}</FormMessage>;
  if (state.saved) return <FormMessage tone="info">{done}</FormMessage>;
  return null;
}

export function DisplayNameForm({ displayName }: { displayName: string }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveDisplayName, {
    value: displayName,
    saved: false,
  });
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="Nombre" hint="Es el que ven tus compañeros en todas tus bandas.">
        <Input name="displayName" defaultValue={state.value} autoComplete="name" required />
      </Field>
      <Outcome state={state} done="Guardamos tu nombre." />
      <Button type="submit" className="self-start" disabled={pending}>
        {pending ? "Guardando…" : "Guardar nombre"}
      </Button>
    </form>
  );
}

// Applies on click: the choice is saved and the page repaints in it.
export function ThemePicker({ theme }: { theme: Theme }) {
  const [chosen, choose] = useOptimistic(theme);
  const [, startTransition] = useTransition();
  return (
    <Segmented
      label="Tema"
      options={THEME_OPTIONS}
      value={chosen}
      onChange={(next) =>
        startTransition(async () => {
          choose(next);
          await saveTheme(next);
        })
      }
    />
  );
}

export function AddPasswordForm({ minPasswordLength }: { minPasswordLength: number }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(savePassword, {
    value: "",
    saved: false,
  });
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="Contraseña nueva" hint={`Al menos ${minPasswordLength} caracteres. Seguís pudiendo ingresar con Google.`}>
        <Input type="password" name="password" autoComplete="new-password" minLength={minPasswordLength} required />
      </Field>
      <Outcome state={state} done="Listo: ya podés ingresar también con tu correo y contraseña." />
      <Button type="submit" className="self-start" disabled={pending}>
        {pending ? "Guardando…" : "Agregar contraseña"}
      </Button>
    </form>
  );
}
