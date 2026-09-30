"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  confirmEmail,
  requestVerificationLink,
  type ConfirmEmailState,
  type RequestLinkState,
} from "@/app/verification-actions.ts";
import { AuthScreen, authCardClass, FormMessage } from "@/components/auth-screen.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Field, Input } from "@/components/ui/field.tsx";

// `email` is the signed-in User's, if any, to prefill a request for a new link.
export function VerifyEmail({ token, email }: { token: string; email?: string }) {
  const [state, action, pending] = useActionState<ConfirmEmailState, FormData>(confirmEmail, {
    invalid: false,
  });
  if (state.invalid) return <InvalidLink email={email} />;

  return (
    <AuthScreen
      title="Verificá tu correo"
      intro="Confirmá que este correo es tuyo para terminar de crear tu cuenta."
    >
      <form action={action} className={authCardClass}>
        <input type="hidden" name="token" value={token} />
        <Button type="submit" variant="primary" size="lg" className="justify-center" disabled={pending}>
          {pending ? "Verificando…" : "Verificar correo"}
        </Button>
      </form>
    </AuthScreen>
  );
}

export function InvalidLink({ email }: { email?: string }) {
  const [state, action, pending] = useActionState<RequestLinkState, FormData>(
    requestVerificationLink,
    { sent: false },
  );

  return (
    <AuthScreen
      title="Este enlace ya no sirve"
      intro="Puede que haya vencido o que ya lo hayas usado. Pedí uno nuevo y usá el último que te llegue."
      footer={
        <>
          ¿Ya verificaste tu correo? <Link href="/ingresar">Ingresar</Link>
        </>
      }
    >
      <form action={action} className={authCardClass}>
        <Field label="Correo electrónico">
          <Input
            size="lg"
            type="email"
            name="email"
            autoComplete="email"
            placeholder="nombre@ejemplo.com"
            defaultValue={email}
            required
          />
        </Field>
        {state.sent && (
          <FormMessage tone="info">
            Si ese correo tiene una cuenta sin verificar, te mandamos un enlace nuevo. Revisá tu bandeja.
          </FormMessage>
        )}
        <Button type="submit" variant="primary" size="lg" className="justify-center" disabled={pending}>
          {pending ? "Enviando…" : "Enviar un enlace nuevo"}
        </Button>
      </form>
    </AuthScreen>
  );
}
