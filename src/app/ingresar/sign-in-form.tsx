"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signIn, type SignInState } from "@/app/session-actions.ts";
import { authCardClass, FormMessage } from "@/components/auth-screen.tsx";
import { GoogleSignIn } from "@/components/google-sign-in.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Field, Input } from "@/components/ui/field.tsx";

export function SignInForm({
  returnPath,
  googleError,
}: {
  returnPath: string | null;
  googleError?: string;
}) {
  const [state, action, pending] = useActionState<SignInState, FormData>(signIn, { email: "" });

  return (
    <form action={action} className={authCardClass}>
      <GoogleSignIn returnPath={returnPath} />
      {returnPath && <input type="hidden" name="volver" value={returnPath} />}
      <Field label="Correo electrónico">
        <Input
          key={state.email}
          size="lg"
          type="email"
          name="email"
          autoComplete="email"
          placeholder="nombre@ejemplo.com"
          defaultValue={state.email}
          required
        />
      </Field>
      <Field label="Contraseña">
        <Input size="lg" type="password" name="password" autoComplete="current-password" required />
      </Field>
      <Link href="/recuperar" className="-mt-1 self-start text-[13px] text-ink-muted hover:text-ink">
        ¿Olvidaste tu contraseña?
      </Link>
      {(state.error ?? googleError) && (
        <FormMessage tone="error">{state.error ?? googleError}</FormMessage>
      )}
      <Button type="submit" variant="primary" size="lg" className="justify-center" disabled={pending}>
        {pending ? "Ingresando…" : "Ingresar"}
      </Button>
    </form>
  );
}
