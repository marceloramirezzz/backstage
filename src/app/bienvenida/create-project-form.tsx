"use client";

import { useActionState } from "react";
import { createProjectAndEnter, type CreateProjectState } from "@/app/welcome-actions.ts";
import { FormMessage } from "@/components/auth-screen.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Field, Input } from "@/components/ui/field.tsx";

// Unavailable until the User verifies their email.
export function CreateProjectForm({ disabled }: { disabled: boolean }) {
  const [state, action, pending] = useActionState<CreateProjectState, FormData>(createProjectAndEnter, {
    name: "",
  });

  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="Nombre de la banda" error={state.error}>
        <Input
          key={state.name}
          name="name"
          placeholder="Ej.: Los del Valle"
          defaultValue={state.name}
          disabled={disabled}
          required
        />
      </Field>
      {disabled && <FormMessage tone="info">Verificá tu correo para crear una banda.</FormMessage>}
      <Button
        type="submit"
        variant="primary"
        className="justify-center"
        disabled={disabled || pending}
      >
        {pending ? "Creando banda…" : "Crear banda"}
      </Button>
    </form>
  );
}
