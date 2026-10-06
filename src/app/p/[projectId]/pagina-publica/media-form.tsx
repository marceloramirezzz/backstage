"use client";

import { useActionState, useRef, useState } from "react";
import { Field, Input } from "@/components/ui/field.tsx";
import type { ListActionState } from "./actions.ts";
import { ListEditor, moved } from "./list-editor.tsx";

interface Row {
  key: string;
  url: string;
  title: string;
}

// A list of links, each with an optional title, in order: audio samples or
// videos, depending on the action. Edits are live once saved.
export function MediaForm({
  projectId,
  items,
  save,
  max,
  maxTitle,
  rowKey,
  empty,
  addLabel,
  urlLabel,
  urlPlaceholder,
}: {
  projectId: string;
  items: { url: string; title: string | null }[];
  save: (prev: ListActionState, form: FormData) => Promise<ListActionState>;
  max: number;
  maxTitle: number;
  rowKey: string;
  empty: string;
  addLabel: string;
  urlLabel: string;
  urlPlaceholder: string;
}) {
  const nextKey = useRef(items.length);
  const [rows, setRows] = useState<Row[]>(() =>
    items.map((m, i) => ({ key: String(i), url: m.url, title: m.title ?? "" })),
  );
  const [state, action, pending] = useActionState<ListActionState, FormData>(save, { done: 0 });
  const edit = (i: number, patch: Partial<Row>) =>
    setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)));

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="projectId" value={projectId} />
      <ListEditor
        rowKey={rowKey}
        rows={rows}
        max={max}
        empty={empty}
        addLabel={addLabel}
        pending={pending}
        saved={state.done > 0}
        error={state.error}
        onAdd={() => setRows((r) => [...r, { key: `n${nextKey.current++}`, url: "", title: "" }])}
        onRemove={(i) => setRows((r) => r.filter((_, j) => j !== i))}
        onMove={(i, by) => setRows((r) => moved(r, i, by))}
        renderRow={(i) => (
          <>
            <Field label={urlLabel}>
              <Input
                name="url"
                type="url"
                inputMode="url"
                placeholder={urlPlaceholder}
                value={rows[i].url}
                onChange={(e) => edit(i, { url: e.target.value })}
                autoComplete="off"
              />
            </Field>
            <Field label="Título (opcional)">
              <Input
                name="title"
                maxLength={maxTitle}
                value={rows[i].title}
                onChange={(e) => edit(i, { title: e.target.value })}
              />
            </Field>
          </>
        )}
      />
    </form>
  );
}
