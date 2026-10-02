"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestReset, type RequestResetState } from "@/app/password-reset-actions.ts";
import { AuthScreen, authCardClass, FormMessage } from "@/components/auth-screen.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Field, Input } from "@/components/ui/field.tsx";

// With `expired`, shown in place of a reset link that no longer works.
export function RequestResetForm({ expired = false }: { expired?: boolean }) {
  const [state, action, pending] = useActionState<RequestResetState, FormData>(requestReset, {
    sent: false,
  });

  return (
    <AuthScreen
      title={expired ? "Este enlace ya no sirve" : "Recuperar tu contraseña"}
      intro={
        expired
          ? "Puede que haya vencido o que ya lo hayas usado. Pedí uno nuevo y usá el último que te llegue."
          : "Escribí tu correo y te mandamos un enlace para elegir una contraseña nueva."
      }
      footer={
        <>
          ¿Te acordaste? <Link href="/ingresar">Ingresar</Link>
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
            required
          />
        </Field>
        {state.sent && (
          <FormMessage tone="info">
            Si ese correo tiene una cuenta con contraseña, te mandamos un enlace. Revisá tu bandeja; vence en 1 hora.
          </FormMessage>
        )}
        <Button type="submit" variant="primary" size="lg" className="justify-center" disabled={pending}>
          {pending ? "Enviando…" : "Enviar enlace"}
        </Button>
      </form>
    </AuthScreen>
  );
}
