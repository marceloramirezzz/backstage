"use client";

import { useActionState } from "react";
import { signIn, type SignInState } from "@/app/session-actions.ts";
import { Button } from "@/components/ui/button.tsx";
import { Field, Input } from "@/components/ui/field.tsx";

function GoogleMark() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="size-[18px] shrink-0 fill-none stroke-current stroke-[1.75] [stroke-linecap:round] [stroke-linejoin:round]"
    >
      <path d="M21 12.2c0-.7-.1-1.3-.2-1.9H12v3.6h5a4.3 4.3 0 0 1-1.9 2.8v2.3h3A9 9 0 0 0 21 12.2z" />
      <path d="M12 21a8.9 8.9 0 0 0 6.1-2.2l-3-2.3a5.6 5.6 0 0 1-8.3-2.9H3.7v2.4A9 9 0 0 0 12 21z" />
      <path d="M6.8 13.6a5.4 5.4 0 0 1 0-3.4V7.8H3.7a9 9 0 0 0 0 8.2z" />
      <path d="M12 6.4c1.4 0 2.6.5 3.6 1.4l2.7-2.7A9 9 0 0 0 3.7 7.8l3.1 2.4A5.4 5.4 0 0 1 12 6.4z" />
    </svg>
  );
}

export function SignInForm({ returnPath }: { returnPath: string | null }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(signIn, { email: "" });

  return (
    <form
      action={action}
      className="flex flex-col gap-4 rounded-lg border border-line bg-bg-1 p-6 max-desktop:p-5"
    >
      {/* Google sign-in arrives with its own ticket. */}
      <Button size="lg" className="justify-center" disabled>
        <GoogleMark />
        Continuar con Google
      </Button>
      <div className="flex items-center gap-3 text-[12px] text-ink-subtle">
        <span className="h-px grow bg-line" />o<span className="h-px grow bg-line" />
      </div>
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
      {state.error && (
        <p role="alert" className="m-0 text-[13px]/[18px] text-status-cancelled">
          {state.error}
        </p>
      )}
      <Button type="submit" variant="primary" size="lg" className="justify-center" disabled={pending}>
        {pending ? "Ingresando…" : "Ingresar"}
      </Button>
    </form>
  );
}
