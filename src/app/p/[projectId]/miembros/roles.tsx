"use client";

import { Lock, Plus, Trash2 } from "lucide-react";
import { useActionState, useEffect, useState, useTransition } from "react";
import { FormMessage } from "@/components/auth-screen.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Field, Input } from "@/components/ui/field.tsx";
import { iconProps } from "@/components/ui/icon-props.ts";
import { roleLabel } from "@/lib/role-label.ts";
import type { RoleKind, RoleToggles } from "@/services/permissions.ts";
import { deleteRoleAction, saveRoleAction, type RoleFormState } from "./actions.ts";

export interface RoleCard {
  id: string;
  kind: RoleKind;
  name: string;
  toggles: RoleToggles | null;
  // Members holding it.
  holders: number;
}

const TOGGLE_COPY: { toggle: keyof RoleToggles; label: string; hint?: string }[] = [
  { toggle: "editRepertoireSetlistsEvents", label: "Editar repertorio, setlists y eventos" },
  { toggle: "removeMembers", label: "Quitar miembros" },
  {
    toggle: "seeTotalPayExpenses",
    label: "Ver cachet y gastos totales por evento",
    hint: "Apagado: solo ven su propia parte.",
  },
];

const NEW = "new";

const chip =
  "inline-flex h-[26px] items-center gap-1 rounded-pill border px-2.5 text-[12px]/[16px] font-medium";

// The Banda's Roles: the two built-ins to look at, custom ones to create,
// edit and delete. Seeing others' splits is shown locked: no Rol can have it.
export function RolesEditor({ projectId, roles }: { projectId: string; roles: RoleCard[] }) {
  const [selected, setSelected] = useState<string>(
    roles.find((r) => r.kind === "custom")?.id ?? NEW,
  );
  const current = roles.find((r) => r.id === selected);
  // A Rol deleted from here or elsewhere leaves nothing selected.
  const shown = current ?? (selected === NEW ? undefined : roles.find((r) => r.kind === "custom"));

  return (
    <div className="flex flex-col gap-4 px-4 pb-4">
      <div className="flex flex-wrap items-center gap-2">
        {roles.map((r) => (
          <button
            key={r.id}
            type="button"
            aria-pressed={shown?.id === r.id}
            onClick={() => setSelected(r.id)}
            className={`${chip} cursor-pointer ${
              shown?.id === r.id
                ? "border-spotlight bg-spotlight text-on-spotlight"
                : "border-line-control bg-bg-3 text-ink hover:border-ink-muted"
            }`}
          >
            {r.kind !== "custom" && <Lock size={12} strokeWidth={1.75} aria-hidden />}
            {roleLabel(r.kind, r.name)}
          </button>
        ))}
        <Button variant="ghost" size="sm" onClick={() => setSelected(NEW)}>
          <Plus {...iconProps} />
          Nuevo rol
        </Button>
      </div>
      {shown?.kind === "admin" || shown?.kind === "member" ? (
        <BuiltInRole key={shown.id} role={shown} />
      ) : (
        <RoleForm
          key={shown?.id ?? NEW}
          projectId={projectId}
          role={shown}
          onCreated={setSelected}
          onDeleted={() => setSelected(NEW)}
        />
      )}
    </div>
  );
}

function Toggle({
  label,
  hint,
  locked,
  ...props
}: {
  label: string;
  hint?: string;
  locked?: boolean;
} & React.ComponentProps<"input">) {
  return (
    <label
      className={`flex items-start gap-2.5 text-[14px]/[20px] ${locked ? "text-ink-muted" : ""}`}
    >
      <input
        type="checkbox"
        disabled={locked}
        className="mt-0.5 size-4 accent-spotlight"
        {...props}
      />
      <span className="flex grow flex-col">
        {label}
        {hint && <span className="text-[12px]/[16px] text-ink-muted">{hint}</span>}
      </span>
      {locked && <Lock size={14} strokeWidth={1.75} aria-hidden className="mt-0.5 text-ink-subtle" />}
    </label>
  );
}

// The permissions every Rol shows locked: own payout always, others' only Admin.
function LockedToggles({ seesOthers }: { seesOthers: boolean }) {
  return (
    <>
      <Toggle label="Ver su propia parte" hint="Siempre activo para todos." checked readOnly locked />
      <Toggle
        label="Ver el reparto de los demás"
        hint="Solo los admins. Ningún rol puede tenerlo."
        checked={seesOthers}
        readOnly
        locked
      />
    </>
  );
}

function BuiltInRole({ role }: { role: RoleCard }) {
  const admin = role.kind === "admin";
  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-[13px]/[18px] text-ink-muted">
        {admin
          ? "Admin puede todo. No se puede editar ni eliminar."
          : "Miembro ve todo y no edita nada. No se puede editar ni eliminar."}
      </p>
      <Toggle label="Editar repertorio, setlists y eventos" checked={admin} readOnly locked />
      <Toggle label="Quitar miembros" checked={admin} readOnly locked />
      <Toggle label="Ver cachet y gastos totales por evento" checked readOnly locked />
      <LockedToggles seesOthers={admin} />
      <Holders count={role.holders} />
    </div>
  );
}

const Holders = ({ count }: { count: number }) => (
  <span className="text-[12px]/[16px] text-ink-muted">
    {count === 1 ? "1 miembro tiene este rol" : `${count} miembros tienen este rol`}
  </span>
);

function RoleForm({
  projectId,
  role,
  onCreated,
  onDeleted,
}: {
  projectId: string;
  role?: RoleCard;
  onCreated: (id: string) => void;
  onDeleted: () => void;
}) {
  const [state, action, pending] = useActionState<RoleFormState, FormData>(saveRoleAction, {
    done: 0,
  });
  const [deleting, startDeleting] = useTransition();
  const [deleteError, setDeleteError] = useState<string>();
  const createdId = state.createdId;
  useEffect(() => {
    if (createdId) onCreated(createdId);
  }, [createdId, onCreated]);

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="projectId" value={projectId} />
      {role && <input type="hidden" name="roleId" value={role.id} />}
      <Field label="Nombre del rol">
        <Input name="name" defaultValue={role?.name ?? ""} placeholder="Ej.: Roadie" maxLength={60} required />
      </Field>
      {TOGGLE_COPY.map(({ toggle, label, hint }) => (
        <Toggle
          key={toggle}
          name={toggle}
          label={label}
          hint={hint}
          defaultChecked={role?.toggles?.[toggle] ?? false}
        />
      ))}
      <LockedToggles seesOthers={false} />
      {state.error && <FormMessage tone="error">{state.error}</FormMessage>}
      {deleteError && <FormMessage tone="error">{deleteError}</FormMessage>}
      {role && state.done > 0 && !state.error && <FormMessage tone="info">Guardamos el rol.</FormMessage>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
        {role ? <Holders count={role.holders} /> : <span />}
        <span className="flex items-center gap-2">
          {role && (
            <Button
              variant="danger"
              size="sm"
              disabled={deleting}
              onClick={() =>
                startDeleting(async () => {
                  const { error } = await deleteRoleAction(projectId, role.id);
                  setDeleteError(error);
                  if (!error) onDeleted();
                })
              }
            >
              <Trash2 {...iconProps} />
              Eliminar
            </Button>
          )}
          <Button type="submit" variant="secondary" size="sm" disabled={pending}>
            {pending ? "Guardando…" : role ? "Guardar rol" : "Crear rol"}
          </Button>
        </span>
      </div>
    </form>
  );
}
