"use client";

import { UserMinus } from "lucide-react";
import { useState, useTransition } from "react";
import { FormMessage } from "@/components/auth-screen.tsx";
import { Avatar } from "@/components/ui/brand.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Dialog } from "@/components/ui/dialog.tsx";
import { Select } from "@/components/ui/field.tsx";
import { iconProps } from "@/components/ui/icon-props.ts";
import { Tag } from "@/components/ui/tag.tsx";
import { initials } from "@/lib/initials.ts";
import { roleLabel } from "@/lib/role-label.ts";
import type { RoleKind } from "@/services/permissions.ts";
import { changeRoleAction, removeMemberAction } from "./actions.ts";

export interface MemberRow {
  userId: string;
  displayName: string;
  roleId: string;
  roleKind: RoleKind;
  roleName: string;
  isOwner: boolean;
  isSelf: boolean;
  // What the acting Member may do to this row; the services enforce it too.
  canRemove: boolean;
  canChangeRole: boolean;
}

export interface RoleOption {
  id: string;
  kind: RoleKind;
  name: string;
}

// Everyone in the Banda with their Rol. Admins change Roles in place; whoever
// may remove Members gets a Quitar button, asked to confirm.
export function MembersList({
  projectId,
  members,
  roles,
}: {
  projectId: string;
  members: MemberRow[];
  roles: RoleOption[];
}) {
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const [removing, setRemoving] = useState<MemberRow | null>(null);

  const changeRole = (member: MemberRow, roleId: string) =>
    startTransition(async () => {
      setError((await changeRoleAction(projectId, member.userId, roleId)).error);
    });
  const remove = (member: MemberRow) =>
    startTransition(async () => {
      const result = await removeMemberAction(projectId, member.userId);
      setError(result.error);
      if (!result.error) setRemoving(null);
    });

  return (
    <div className="flex flex-col">
      {error && (
        <div className="px-4 pb-3">
          <FormMessage tone="error">{error}</FormMessage>
        </div>
      )}
      <ul className="m-0 flex list-none flex-col p-0">
        {members.map((m) => (
          <li
            key={m.userId}
            className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line px-4 py-3"
          >
            <span className="flex min-w-0 flex-1 basis-48 items-center gap-2.5">
              <Avatar tone="neutral" size="md" initials={initials(m.displayName)} />
              <span className="truncate text-[14px]/[20px] font-medium">
                {m.displayName}
                {m.isSelf && <span className="font-normal text-ink-muted"> (vos)</span>}
              </span>
            </span>
            <span className="flex items-center gap-2 text-[14px]/[20px]">
              {m.canChangeRole ? (
                <Select
                  aria-label={`Rol de ${m.displayName}`}
                  className="h-8 w-36"
                  value={m.roleId}
                  disabled={pending}
                  onChange={(e) => changeRole(m, e.target.value)}
                >
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {roleLabel(r.kind, r.name)}
                    </option>
                  ))}
                </Select>
              ) : (
                roleLabel(m.roleKind, m.roleName)
              )}
              {m.isOwner && <Tag>Dueño</Tag>}
            </span>
            <span className="ml-auto flex min-h-[30px] items-center">
              {m.canRemove && (
                <Button variant="ghost" size="sm" onClick={() => setRemoving(m)}>
                  Quitar
                </Button>
              )}
            </span>
          </li>
        ))}
      </ul>
      <Dialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title="Quitar de la banda"
      >
        {removing && (
          <div className="flex flex-col gap-4">
            <p className="m-0 text-[14px]/[20px] text-ink-muted">
              ¿Quitar a <span className="font-medium text-ink">{removing.displayName}</span> de la
              banda? Pierde el acceso al instante, pero los eventos pagados conservan su reparto. Para
              que vuelva, hay que invitar de nuevo a esa persona.
            </p>
            {error && <FormMessage tone="error">{error}</FormMessage>}
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setRemoving(null)}>
                Cancelar
              </Button>
              <Button variant="danger" disabled={pending} onClick={() => remove(removing)}>
                <UserMinus {...iconProps} />
                {pending ? "Quitando…" : "Quitar"}
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
