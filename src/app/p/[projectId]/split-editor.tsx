"use client";

import { useActionState, useState } from "react";
import {
  saveDefaultSplit,
  saveEventSplit,
} from "@/app/p/[projectId]/eventos/split-actions.ts";
import { FormMessage } from "@/components/auth-screen.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input, Select } from "@/components/ui/field.tsx";
import { groupThousands } from "@/lib/format.ts";
import { roleLabel } from "@/lib/role-label.ts";
import { basisPointsToPercent, NO_RULE, percentToBasisPoints } from "@/lib/split-form.ts";
import type { SplitKind, SplitRole, SplitRule } from "@/services/splits.ts";

const KIND_LABELS: Record<SplitKind | typeof NO_RULE, string> = {
  percentage: "Porcentaje",
  role_fixed: "Fijo para el rol",
  member_fixed: "Fijo por miembro",
  [NO_RULE]: "No cobra",
};

const HINTS: Record<SplitKind | typeof NO_RULE, string> = {
  percentage: "se reparte entre quienes tocaron",
  role_fixed: "se paga antes de los porcentajes y se divide en partes iguales",
  member_fixed: "se paga antes de los porcentajes a cada uno que tocó",
  [NO_RULE]: "no participa del reparto",
};

interface Row {
  kind: SplitKind | typeof NO_RULE;
  value: string;
}

const toRow = (rule: SplitRule | undefined): Row =>
  !rule
    ? { kind: NO_RULE, value: "" }
    : { kind: rule.kind, value: rule.kind === "percentage" ? basisPointsToPercent(rule.value) : String(rule.value) };

// One row per Role: how it's paid and how much. The form for the Banda's
// default Reparto, or (with `eventId`) for an Evento's own. Admin only; the
// services enforce it too.
export function SplitEditor({
  projectId,
  eventId,
  roles,
  rules,
  submitLabel,
  children,
}: {
  projectId: string;
  eventId?: string;
  roles: SplitRole[];
  rules: SplitRule[];
  submitLabel: string;
  // Extra actions beside the submit button.
  children?: React.ReactNode;
}) {
  const [state, action, pending] = useActionState(eventId ? saveEventSplit : saveDefaultSplit, { done: 0 });
  const [rows, setRows] = useState<Record<string, Row>>(() =>
    Object.fromEntries(roles.map((r) => [r.id, toRow(rules.find((x) => x.roleId === r.id))])),
  );
  // The save count at the last edit: "saved" holds until the form changes again.
  const [editedAt, setEditedAt] = useState(0);
  const saved = state.done > 0 && editedAt !== state.done;

  const set = (id: string, patch: Partial<Row>) => {
    setEditedAt(state.done);
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };
  const percentRows = Object.values(rows).filter((r) => r.kind === "percentage");
  const total = percentRows.reduce((sum, r) => sum + percentToBasisPoints(r.value || "0"), 0);
  const valid = percentRows.length === 0 || total === 10_000;

  return (
    <form action={action} className="flex flex-col">
      <input type="hidden" name="projectId" value={projectId} />
      {eventId && <input type="hidden" name="eventId" value={eventId} />}
      <input type="hidden" name="roleIds" value={roles.map((r) => r.id).join(",")} />
      {roles.map((role) => {
        const row = rows[role.id];
        const label = roleLabel(role.kind, role.name);
        return (
          <div
            key={role.id}
            className="grid grid-cols-[minmax(0,1fr)_200px_180px] items-center gap-x-4 gap-y-2 border-t border-line py-3 max-sm:grid-cols-2"
          >
            <span className="flex min-w-0 flex-col max-sm:col-span-2">
              <span className="text-[14px]/[20px] font-medium">{label}</span>
              <span className="text-[12px]/[16px] text-ink-muted">
                {role.memberCount} {role.memberCount === 1 ? "miembro" : "miembros"} · {HINTS[row.kind]}
              </span>
            </span>
            <Select
              name={`kind-${role.id}`}
              aria-label={`Tipo de reparto para ${label}`}
              value={row.kind}
              onChange={(e) => set(role.id, { kind: e.target.value as Row["kind"] })}
            >
              {(Object.keys(KIND_LABELS) as Row["kind"][]).map((k) => (
                <option key={k} value={k}>
                  {KIND_LABELS[k]}
                </option>
              ))}
            </Select>
            <label className="relative">
              <Input
                name={`value-${role.id}`}
                aria-label={`Monto para ${label}`}
                inputMode={row.kind === "percentage" ? "decimal" : "numeric"}
                disabled={row.kind === NO_RULE}
                value={row.kind === "percentage" ? row.value : groupThousands(row.value.replace(/\D/g, ""))}
                onChange={(e) => set(role.id, { value: e.target.value })}
                className={`text-right font-mono ${row.kind === "percentage" ? "pr-9" : ""}`}
              />
              {row.kind === "percentage" && (
                <span aria-hidden className="absolute top-2 right-3 text-ink-muted">
                  %
                </span>
              )}
            </label>
          </div>
        );
      })}
      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
        <span
          role="status"
          className={`text-[13px]/[18px] ${valid ? "text-status-confirmed" : "text-status-cancelled"}`}
        >
          {percentRows.length === 0
            ? "Sin porcentajes: solo montos fijos"
            : valid
              ? "Los porcentajes suman 100 %"
              : `Los porcentajes suman ${basisPointsToPercent(total)} %: deben sumar 100 %`}
        </span>
        <span className="text-[12px]/[16px] text-ink-muted">
          Los montos fijos salen primero del neto; un rol sin nadie que haya tocado se saltea y su % se reparte.
        </span>
        <span className="ml-auto flex items-center gap-2">
          {children}
          <Button type="submit" variant={eventId ? "secondary" : "primary"} size="sm" disabled={pending || !valid}>
            {submitLabel}
          </Button>
        </span>
      </div>
      {state.error && <FormMessage tone="error">{state.error}</FormMessage>}
      {saved && !state.error && <FormMessage tone="info">Guardado.</FormMessage>}
    </form>
  );
}
