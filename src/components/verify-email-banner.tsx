"use client";

import { Mail } from "lucide-react";
import { useActionState } from "react";
import { resendMyVerificationLink, type RequestLinkState } from "@/app/verification-actions.ts";
import { Button } from "@/components/ui/button.tsx";
import { iconProps } from "@/components/ui/icon-props.ts";

// Shown to a User who hasn't verified their email, saying what that blocks
// and offering a new link (from the handoff's welcome screen).
export function VerifyEmailBanner({ email }: { email: string }) {
  const [state, action, pending] = useActionState<RequestLinkState, FormData>(
    resendMyVerificationLink,
    { sent: false },
  );

  return (
    <form
      action={action}
      className="flex flex-wrap items-center gap-3 rounded-md bg-status-pending-bg px-4 py-3 text-[14px]/[20px] text-ink"
    >
      <span className="text-status-pending">
        <Mail {...iconProps} />
      </span>
      <span className="min-w-0 grow basis-60">
        Revisá tu bandeja para verificar <b className="break-all">{email}</b>. Lo necesitás para
        crear una banda o aceptar una invitación.
      </span>
      {state.sent ? (
        <span role="status" className="text-[13px]/[20px] text-ink-muted">
          Te mandamos un correo nuevo.
        </span>
      ) : (
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Enviando…" : "Reenviar correo"}
        </Button>
      )}
    </form>
  );
}
