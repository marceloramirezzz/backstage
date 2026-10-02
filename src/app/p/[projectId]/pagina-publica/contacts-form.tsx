"use client";

import { useActionState, useRef, useState } from "react";
import { Field, Input, Select } from "@/components/ui/field.tsx";
import { CONTACT_LABELS } from "@/lib/contact-label.ts";
import { CONTACT_PLATFORMS, type ContactPlatform } from "@/lib/contact-link.ts";
import { saveContacts, type ListActionState } from "./actions.ts";
import { ListEditor, moved } from "./list-editor.tsx";

interface Row {
  key: string;
  platform: ContactPlatform;
  label: string;
  value: string;
}

const HINTS: Record<ContactPlatform, string> = {
  instagram: "@usuario",
  facebook: "https://facebook.com/…",
  whatsapp: "+595 981 123 456",
  email: "banda@ejemplo.com",
  phone: "+595 981 123 456",
  tiktok: "https://tiktok.com/@…",
  youtube: "https://youtube.com/…",
  spotify: "https://open.spotify.com/…",
  website: "https://…",
  other: "",
};

// The contact links: a preset platform with a value, or Otro with a label of
// the Admin's own. Edits are live once saved.
export function ContactsForm({
  projectId,
  contacts,
  max,
  maxLabel,
  maxValue,
}: {
  projectId: string;
  contacts: { platform: ContactPlatform; label: string | null; value: string }[];
  max: number;
  maxLabel: number;
  maxValue: number;
}) {
  const nextKey = useRef(contacts.length);
  const [rows, setRows] = useState<Row[]>(() =>
    contacts.map((c, i) => ({ key: String(i), platform: c.platform, label: c.label ?? "", value: c.value })),
  );
  const [state, action, pending] = useActionState<ListActionState, FormData>(saveContacts, { done: 0 });
  const edit = (i: number, patch: Partial<Row>) =>
    setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)));

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="projectId" value={projectId} />
      <ListEditor
        rowKey="contact"
        rows={rows}
        max={max}
        empty="Todavía no hay contactos."
        addLabel="Agregar contacto"
        pending={pending}
        saved={state.done > 0}
        error={state.error}
        onAdd={() =>
          setRows((r) => [...r, { key: `n${nextKey.current++}`, platform: "instagram", label: "", value: "" }])
        }
        onRemove={(i) => setRows((r) => r.filter((_, j) => j !== i))}
        onMove={(i, by) => setRows((r) => moved(r, i, by))}
        renderRow={(i) => (
          <>
            <Field label="Plataforma">
              <Select
                name="platform"
                value={rows[i].platform}
                onChange={(e) => edit(i, { platform: e.target.value as ContactPlatform })}
              >
                {CONTACT_PLATFORMS.map((p) => (
                  <option key={p} value={p}>
                    {CONTACT_LABELS[p]}
                  </option>
                ))}
              </Select>
            </Field>
            {/* Always submitted so labels stay aligned with their rows; only Otro keeps it. */}
            {rows[i].platform === "other" ? (
              <Field label="Nombre">
                <Input
                  name="label"
                  maxLength={maxLabel}
                  placeholder="Telegram"
                  value={rows[i].label}
                  onChange={(e) => edit(i, { label: e.target.value })}
                />
              </Field>
            ) : (
              <input type="hidden" name="label" value="" />
            )}
            <Field label="Dato">
              <Input
                name="value"
                maxLength={maxValue}
                placeholder={HINTS[rows[i].platform]}
                value={rows[i].value}
                onChange={(e) => edit(i, { value: e.target.value })}
                autoCapitalize="none"
                autoComplete="off"
                spellCheck={false}
              />
            </Field>
          </>
        )}
      />
    </form>
  );
}
