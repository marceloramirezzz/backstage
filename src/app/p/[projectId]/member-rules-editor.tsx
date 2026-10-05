"use client";

import { useActionState, useState } from "react";
import { saveEventMemberSetting, saveMemberRule } from "@/app/p/[projectId]/eventos/split-actions.ts";
import { FormMessage } from "@/components/auth-screen.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input, Select } from "@/components/ui/field.tsx";
import { formatGuaranies, groupThousands } from "@/lib/format.ts";
import { roleLabel } from "@/lib/role-label.ts";
import type { EventMemberRuleRow, MemberRule, MemberRuleRow } from "@/services/splits.ts";

const ruleText = (rule: MemberRule) => (rule.kind === "fixed" ? `monto fijo ${formatGuaranies(rule.value)}` : "partes iguales");

const Amount = ({ name, label, value, onChange, disabled, signed }: {
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  signed?: boolean;
}) => (
  <Input
    name={name}
    aria-label={label}
    inputMode={signed ? "text" : "numeric"}
    disabled={disabled}
    value={value}
    placeholder={signed ? "0" : ""}
    onChange={(e) =>
      onChange(
        signed
          ? e.target.value.replace(/[^\d+\-−.]/g, "")
          : groupThousands(e.target.value.replace(/\D/g, "")),
      )
    }
    className="text-right font-mono"
  />
);

const rowClass =
  "grid grid-cols-[minmax(0,1fr)_170px_150px_auto] items-center gap-x-3 gap-y-2 border-t border-line py-3 max-sm:grid-cols-2";

// One Miembro's default rule in the Banda: partes iguales or a fixed amount.
// Admin only; the services enforce it too.
export function MemberRuleRowForm({ projectId, member }: { projectId: string; member: MemberRuleRow }) {
  const [state, action, pending] = useActionState(saveMemberRule, { done: 0 });
  const [kind, setKind] = useState(member.rule.kind);
  const [value, setValue] = useState(member.rule.kind === "fixed" ? groupThousands(String(member.rule.value)) : "");
  return (
    <form action={action} className={rowClass}>
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="userId" value={member.userId} />
      <span className="flex min-w-0 flex-col max-sm:col-span-2">
        <span className="truncate text-[14px]/[20px] font-medium">{member.displayName}</span>
        <span className="text-[12px]/[16px] text-ink-muted">{roleLabel(member.roleKind, member.roleName)}</span>
      </span>
      <Select name="kind" aria-label={`Regla de ${member.displayName}`} value={kind} onChange={(e) => setKind(e.target.value as MemberRule["kind"])}>
        <option value="equal">Parte igual</option>
        <option value="fixed">Monto fijo</option>
      </Select>
      <Amount name="value" label={`Monto fijo de ${member.displayName}`} value={value} onChange={setValue} disabled={kind !== "fixed"} />
      <Button type="submit" variant="secondary" size="sm" disabled={pending}>
        Guardar
      </Button>
      {state.error && <FormMessage tone="error">{state.error}</FormMessage>}
      {state.done > 0 && !state.error && <FormMessage tone="info">Guardado.</FormMessage>}
    </form>
  );
}

// One Miembro's settings for one Evento: a rule replacing their default, and
// an Ajuste (signed) added to their share. Admin only.
export function EventMemberRowForm({
  projectId,
  eventId,
  member,
}: {
  projectId: string;
  eventId: string;
  member: EventMemberRuleRow;
}) {
  const [state, action, pending] = useActionState(saveEventMemberSetting, { done: 0 });
  const [mode, setMode] = useState<"default" | MemberRule["kind"]>(member.override?.kind ?? "default");
  const [value, setValue] = useState(member.override?.kind === "fixed" ? groupThousands(String(member.override.value)) : "");
  const [ajuste, setAjuste] = useState(member.ajuste === 0 ? "" : `${member.ajuste > 0 ? "+" : "-"}${groupThousands(String(Math.abs(member.ajuste)))}`);
  return (
    <form action={action} className="grid grid-cols-2 items-center gap-x-3 gap-y-2 border-t border-line py-3">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="userId" value={member.userId} />
      <span className="col-span-2 flex min-w-0 flex-col">
        <span className="truncate text-[14px]/[20px] font-medium">{member.displayName}</span>
        <span className="text-[12px]/[16px] text-ink-muted">Por defecto: {ruleText(member.rule)}</span>
      </span>
      <Select name="mode" aria-label={`Regla de ${member.displayName} en este evento`} value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
        <option value="default">Según la banda</option>
        <option value="equal">Parte igual</option>
        <option value="fixed">Monto fijo</option>
      </Select>
      <Amount name="value" label={`Monto fijo de ${member.displayName} en este evento`} value={value} onChange={setValue} disabled={mode !== "fixed"} />
      <label className="flex items-center gap-2 text-[12px]/[16px] text-ink-muted">
        Ajuste
        <Amount name="ajuste" label={`Ajuste de ${member.displayName}`} value={ajuste} onChange={setAjuste} signed />
      </label>
      <Button type="submit" variant="secondary" size="sm" disabled={pending} className="justify-self-end">
        Guardar
      </Button>
      {state.error && <FormMessage tone="error">{state.error}</FormMessage>}
      {state.done > 0 && !state.error && <FormMessage tone="info">Guardado.</FormMessage>}
    </form>
  );
}
