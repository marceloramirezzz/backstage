"use client";

import { useActionState, useRef, useState } from "react";
import { Field, Input } from "@/components/ui/field.tsx";
import { saveAlbum, type ListActionState } from "./actions.ts";
import { ListEditor, moved } from "./list-editor.tsx";

interface Row {
  key: string;
  url: string;
  caption: string;
}

// The album: photos by https address, in order, each with an optional
// caption. Edits are live once saved.
export function AlbumForm({
  projectId,
  photos,
  max,
  maxCaption,
}: {
  projectId: string;
  photos: { url: string; caption: string | null }[];
  max: number;
  maxCaption: number;
}) {
  const nextKey = useRef(photos.length);
  const [rows, setRows] = useState<Row[]>(() =>
    photos.map((p, i) => ({ key: String(i), url: p.url, caption: p.caption ?? "" })),
  );
  const [state, action, pending] = useActionState<ListActionState, FormData>(saveAlbum, { done: 0 });
  const edit = (i: number, patch: Partial<Row>) =>
    setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)));

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="projectId" value={projectId} />
      <ListEditor
        rowKey="photo"
        rows={rows}
        max={max}
        empty="Todavía no hay fotos."
        addLabel="Agregar foto"
        pending={pending}
        saved={state.done > 0}
        error={state.error}
        onAdd={() => setRows((r) => [...r, { key: `n${nextKey.current++}`, url: "", caption: "" }])}
        onRemove={(i) => setRows((r) => r.filter((_, j) => j !== i))}
        onMove={(i, by) => setRows((r) => moved(r, i, by))}
        renderRow={(i) => (
          <>
            <Field label="Dirección de la foto">
              <Input
                name="url"
                type="url"
                inputMode="url"
                placeholder="https://…"
                value={rows[i].url}
                onChange={(e) => edit(i, { url: e.target.value })}
                autoComplete="off"
              />
            </Field>
            <Field label="Descripción (opcional)">
              <Input
                name="caption"
                maxLength={maxCaption}
                value={rows[i].caption}
                onChange={(e) => edit(i, { caption: e.target.value })}
              />
            </Field>
          </>
        )}
      />
    </form>
  );
}
