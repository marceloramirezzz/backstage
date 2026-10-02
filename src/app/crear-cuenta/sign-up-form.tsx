"use client";

import { useActionState } from "react";
import { createAccount, type SignUpState } from "@/app/session-actions.ts";
import { authCardClass, FormMessage } from "@/components/auth-screen.tsx";
import { GoogleSignIn } from "@/components/google-sign-in.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Field, Input } from "@/components/ui/field.tsx";

export function SignUpForm({
  returnPath,
  minPasswordLength,
}: {
  returnPath: string | null;
  minPasswordLength: number;
}) {
  const [state, action, pending] = useActionState<SignUpState, FormData>(createAccount, {
    displayName: "",
    email: "",
  });

  return (
    <form action={action} className={authCardClass}>
      <GoogleSignIn returnPath={returnPath} />
      {returnPath && <input type="hidden" name="volver" value={returnPath} />}
      <Field label="Nombre" hint="Así te van a ver en tus bandas.">
        <Input
          key={`name-${state.displayName}`}
          size="lg"
          name="displayName"
          autoComplete="name"
          placeholder="Diego Benítez"
          defaultValue={state.displayName}
          required
        />
      </Field>
      <Field label="Correo electrónico" hint="Te vamos a mandar un enlace para verificarlo.">
        <Input
          key={`email-${state.email}`}
          size="lg"
          type="email"
          name="email"
          autoComplete="email"
          placeholder="nombre@ejemplo.com"
          defaultValue={state.email}
          required
        />
      </Field>
      <Field label="Contraseña" hint={`Al menos ${minPasswordLength} caracteres.`}>
        <Input
          size="lg"
          type="password"
          name="password"
          autoComplete="new-password"
          minLength={minPasswordLength}
          required
        />
      </Field>
      {state.error && <FormMessage tone="error">{state.error}</FormMessage>}
      <Button type="submit" variant="primary" size="lg" className="justify-center" disabled={pending}>
        {pending ? "Creando cuenta…" : "Crear cuenta"}
      </Button>
    </form>
  );
}
