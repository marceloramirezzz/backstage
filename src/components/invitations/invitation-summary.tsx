import { Avatar } from "@/components/ui/brand.tsx";
import { formatExpiresIn } from "@/lib/format.ts";
import { initials } from "@/lib/initials.ts";
import { roleLabel } from "@/lib/role-label.ts";
import type { ReceivedInvitation } from "@/services/invitations.ts";

// The Banda an Invitación is for, with its Rol, who sent it and when it
// expires (from the handoff's welcome screen).
export function InvitationSummary({ invitation }: { invitation: ReceivedInvitation }) {
  const details = [
    `Entrar como ${roleLabel(invitation.roleKind, invitation.roleName)}`,
    `de ${invitation.invitedByName}`,
    formatExpiresIn(invitation.expiresAt),
  ];
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar initials={initials(invitation.projectName)} size="lg" />
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-[14px]/[20px] font-medium">{invitation.projectName}</span>
        <span className="text-[12px]/[16px] text-ink-muted">{details.join(" · ")}</span>
      </span>
    </div>
  );
}
