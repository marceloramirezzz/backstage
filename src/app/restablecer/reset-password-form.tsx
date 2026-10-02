"use client";

import { useActionState } from "react";
import { setNewPassword, type ResetPasswordState } from "@/app/password-reset-actions.ts";
import { AuthScreen, authCardClass, FormMessage } from "@/components/auth-screen.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Field, Input } from "@/components/ui/field.tsx";
import { RequestResetForm } from "../recuperar/request-reset-form.tsx";

export function ResetPasswordForm({
  token,
  minPasswordLength,
}: {
  token: string;
  minPasswordLength: number;
}) {
  const [state, action, pending] = useActionState<ResetPasswordState, FormData>(setNewPassword, {
    invalid: false,
  });
  if (state.invalid) return <RequestResetForm expired />;

  return (
    <AuthScreen title="Elegí una contraseña nueva" intro="Después de guardarla vas a entrar a Backstage.">
      <form action={action} className={authCardClass}>
        <input type="hidden" name="token" value={token} />
        <Field label="Contraseña nueva" hint={`Al menos ${minPasswordLength} caracteres.`}>
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
          {pending ? "Guardando…" : "Guardar contraseña"}
        </Button>
      </form>
    </AuthScreen>
  );
}
