"use client";

import { Mail, Plus, Send, X } from "lucide-react";
import { useActionState, useEffect, useEffectEvent, useRef, useState, useTransition } from "react";
import { FormMessage } from "@/components/auth-screen.tsx";
import { Button, IconButton } from "@/components/ui/button.tsx";
import { Dialog } from "@/components/ui/dialog.tsx";
import { Field, Input, Select } from "@/components/ui/field.tsx";
import { iconProps } from "@/components/ui/icon-props.ts";
import { roleLabel } from "@/lib/role-label.ts";
import { submitKeepingFields } from "@/lib/submit-keeping-fields.ts";
import {
  resendInvitationAction,
  revokeInvitationAction,
  sendInvitationsAction,
  type FormState,
} from "./actions.ts";
import type { RoleOption } from "./members-list.tsx";

export interface InvitationRow {
  id: string;
  email: string;
  // The Rol as the UI names it; null once it was deleted.
  roleLabel: string | null;
  expired: boolean;
  // Whole days left, rounded up; 0 once expired.
  daysLeft: number;
}

// The Invitar button and the dialog behind it: several emails at once, each
// with its own Rol.
export function InviteButton({
  projectId,
  roles,
}: {
  projectId: string;
  roles: RoleOption[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        <Mail {...iconProps} />
        Invitar miembros
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Invitar miembros">
        <InviteForm projectId={projectId} roles={roles} onClose={() => setOpen(false)} />
      </Dialog>
    </>
  );
}

function InviteForm({
  projectId,
  roles,
  onClose,
}: {
  projectId: string;
  roles: RoleOption[];
  onClose: () => void;
}) {
  const memberRole = roles.find((r) => r.kind === "member") ?? roles[0];
  const nextKey = useRef(1);
  const [rows, setRows] = useState([{ key: 0, email: "", roleId: memberRole.id }]);
  const [state, action, pending] = useActionState<FormState, FormData>(sendInvitationsAction, {
    done: 0,
  });

  const onSent = useEffectEvent(onClose);
  useEffect(() => {
    if (state.done) onSent();
  }, [state.done]);

  const edit = (key: number, patch: Partial<(typeof rows)[number]>) =>
    setRows((r) => r.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  if (state.created) {
    return (
      <div className="flex flex-col gap-4">
        {state.error && <FormMessage tone="error">{state.error}</FormMessage>}
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            Listo
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submitKeepingFields(action)} className="flex flex-col gap-4">
      <input type="hidden" name="projectId" value={projectId} />
      <p className="m-0 text-[13px]/[18px] text-ink-muted">
        Les llega un correo con un enlace que dura 7 días. Solo pueden aceptarla con ese mismo
        correo.
      </p>
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {rows.map((row, i) => (
          <li key={row.key} className="flex items-end gap-2">
            <Field label={i === 0 ? "Correo" : <span className="sr-only">Correo</span>} className="min-w-0 flex-1">
              <Input
                name="email"
                type="email"
                inputMode="email"
                autoComplete="off"
                placeholder="persona@ejemplo.com"
                value={row.email}
                onChange={(e) => edit(row.key, { email: e.target.value })}
                data-autofocus={i === 0 ? "" : undefined}
              />
            </Field>
            <Field label={i === 0 ? "Rol" : <span className="sr-only">Rol</span>} className="w-32 shrink-0">
              <Select
                name="roleId"
                value={row.roleId}
                onChange={(e) => edit(row.key, { roleId: e.target.value })}
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {roleLabel(r.kind, r.name)}
                  </option>
                ))}
              </Select>
            </Field>
            <IconButton
              square
              aria-label="Quitar este correo"
              className="mb-[3px]"
              disabled={rows.length === 1}
              onClick={() => setRows((r) => r.filter((x) => x.key !== row.key))}
            >
              <X {...iconProps} />
            </IconButton>
          </li>
        ))}
      </ul>
      <Button
        variant="ghost"
        size="sm"
        className="self-start"
        onClick={() =>
          setRows((r) => [...r, { key: nextKey.current++, email: "", roleId: memberRole.id }])
        }
      >
        <Plus {...iconProps} />
        Agregar otro correo
      </Button>
      {state.error && <FormMessage tone="error">{state.error}</FormMessage>}
      <div className="flex justify-end gap-3">
        <Button variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" variant="secondary" disabled={pending}>
          <Send {...iconProps} />
          {pending ? "Enviando…" : "Enviar invitaciones"}
        </Button>
      </div>
    </form>
  );
}

// The open Invitaciones: pending ones with their days left, expired ones
// until resent or revoked.
export function InvitationList({
  projectId,
  invitations,
}: {
  projectId: string;
  invitations: InvitationRow[];
}) {
  const [message, setMessage] = useState<{ tone: "error" | "info"; text: string }>();
  const [pending, startTransition] = useTransition();

  const run = (work: () => Promise<{ error?: string }>, done?: string) =>
    startTransition(async () => {
      const { error } = await work();
      setMessage(error ? { tone: "error", text: error } : done ? { tone: "info", text: done } : undefined);
    });

  if (!invitations.length) {
    return (
      <p className="m-0 px-4 pb-4 text-[14px]/[20px] text-ink-muted">
        No hay invitaciones abiertas.
      </p>
    );
  }
  return (
    <div className="flex flex-col">
      {message && (
        <div className="px-4 pb-3">
          <FormMessage tone={message.tone}>{message.text}</FormMessage>
        </div>
      )}
      <ul className="m-0 flex list-none flex-col p-0">
        {invitations.map((i) => (
          <li
            key={i.id}
            className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line px-4 py-3"
          >
            <span className="flex min-w-0 flex-1 basis-48 items-center gap-2.5">
              <span className="inline-grid size-8 shrink-0 place-items-center rounded-pill border border-dashed border-line-control text-ink-muted">
                <Mail size={14} strokeWidth={1.75} aria-hidden />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[14px]/[20px]">{i.email}</span>
                <span
                  className={`text-[12px]/[16px] ${i.expired ? "text-status-cancelled" : "text-status-pending"}`}
                >
                  {i.expired
                    ? "Venció"
                    : `Pendiente · vence en ${i.daysLeft} ${i.daysLeft === 1 ? "día" : "días"}`}
                </span>
              </span>
            </span>
            <span className="text-[14px]/[20px]">{i.roleLabel ?? "—"}</span>
            <span className="ml-auto flex items-center">
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() =>
                  run(() => resendInvitationAction(projectId, i.id), `Reenviamos la invitación a ${i.email}.`)
                }
              >
                Reenviar
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => run(() => revokeInvitationAction(projectId, i.id))}
              >
                Cancelar invitación
              </Button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
