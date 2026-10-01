"use client";

import { useActionState } from "react";
import { acceptInvitationAndEnter, type AcceptInvitationState } from "@/app/welcome-actions.ts";
import { FormMessage } from "@/components/auth-screen.tsx";
import { Button, type ButtonSize, type ButtonVariant } from "@/components/ui/button.tsx";

// Accepts an Invitation, landing in its Project. `disabled` with a reason
// when the User can't accept yet.
export function AcceptInvitationForm({
  invitationId,
  projectId,
  variant = "secondary",
  size = "sm",
  disabledReason,
  className = "",
}: {
  invitationId: string;
  projectId: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabledReason?: string;
  className?: string;
}) {
  const [state, action, pending] = useActionState<AcceptInvitationState, FormData>(
    acceptInvitationAndEnter,
    {},
  );

  return (
    <form action={action} className={`flex flex-col gap-2 ${className}`}>
      <input type="hidden" name="invitationId" value={invitationId} />
      <input type="hidden" name="projectId" value={projectId} />
      <Button
        type="submit"
        variant={variant}
        size={size}
        className="justify-center"
        disabled={pending || Boolean(disabledReason)}
      >
        {pending ? "Aceptando…" : "Aceptar"}
      </Button>
      {disabledReason && <FormMessage tone="info">{disabledReason}</FormMessage>}
      {state.error && <FormMessage tone="error">{state.error}</FormMessage>}
    </form>
  );
}
