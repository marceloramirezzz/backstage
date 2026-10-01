"use client";

import { ArrowDown, ArrowUp, Copy, GripVertical, Plus, Trash2, X } from "lucide-react";
import Link from "next/link";
import {
  startTransition,
  useActionState,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import { FormMessage } from "@/components/auth-screen.tsx";
import { Button, IconButton } from "@/components/ui/button.tsx";
import { Dialog } from "@/components/ui/dialog.tsx";
import { Field, Input, Select } from "@/components/ui/field.tsx";
import { iconProps } from "@/components/ui/icon-props.ts";
import { IntensityMeter } from "@/components/ui/intensity-meter.tsx";
import { Tag } from "@/components/ui/tag.tsx";
import { formatClock } from "@/lib/format.ts";
import { INTENSITY_LABELS } from "@/lib/intensity-label.ts";
import type { Selection } from "@/services/selections.ts";
import type { Setlist, SetlistItem } from "@/services/setlists.ts";
import type { Song } from "@/services/songs.ts";
import {
  addSetlist,
  copySetlist,
  removeSetlist,
  saveSetlist,
  type SetlistActionState,
  type SetlistFormState,
} from "./actions.ts";
import { formatTotal } from "./total.ts";

// Opens the form for a new, empty Setlist.
export function NewSetlistButton({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Plus {...iconProps} />
        Nueva setlist
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Nueva setlist">
        <NewSetlistForm projectId={projectId} onClose={() => setOpen(false)} />
      </Dialog>
    </>
  );
}

function NewSetlistForm({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const [state, action, pending] = useActionState<SetlistActionState, FormData>(addSetlist, {});
  return (
    <form onSubmit={submitKeepingFields(action)} className="flex flex-col gap-4">
      <input type="hidden" name="projectId" value={projectId} />
      <Field label="Nombre">
        <Input name="name" placeholder="Ej.: Boda clásica" required data-autofocus />
      </Field>
      <Field label="Categoría" hint="Opcional. Por ejemplo: cumbia, rock, boda.">
        <Input name="category" />
      </Field>
      {state.error && <FormMessage tone="error">{state.error}</FormMessage>}
      <div className="flex justify-end gap-3">
        <Button variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Creando…" : "Crear setlist"}
        </Button>
      </div>
    </form>
  );
}

// Submits by hand so a failed save keeps what was typed (a form action would
// reset the fields).
const submitKeepingFields =
  (action: (data: FormData) => void) => (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => action(data));
  };

// An item while editing, keyed so a Song that comes back twice stays two rows.
interface Row {
  key: string;
  entry: SetlistItem;
}

const toRow = (entry: SetlistItem): Row => ({ key: crypto.randomUUID(), entry });

// Up at the top, or down at the bottom: shown faded rather than disabled, so
// keyboard focus stays on it after moving an item to the end.
const EDGE_BUTTON = "aria-disabled:cursor-not-allowed aria-disabled:opacity-30";

// What saving sends for an item: `song:<id>` or `selection:<id>`.
const itemValue = ({ kind, item }: SetlistItem) => `${kind}:${item.id}`;

const totalSeconds = (entries: SetlistItem[]) =>
  entries.reduce((sum, { item }) => sum + item.durationSeconds, 0);

// The chosen Setlist, editable: name, category, and its items, reordered by
// dragging or with up/down buttons, added from the Repertoire and taken out.
// Nothing is stored until it's saved. With a mouse the up/down buttons show
// on hover or focus; on touch and under 640px, where dragging doesn't work,
// they always show and the drag handle goes.
export function SetlistEditor({
  projectId,
  setlist,
  songs,
  selections,
}: {
  projectId: string;
  setlist: Setlist;
  songs: Song[];
  selections: Selection[];
}) {
  const [state, action, pending] = useActionState<SetlistFormState, FormData>(saveSetlist, {
    saved: 0,
  });
  const [name, setName] = useState(setlist.name);
  const [category, setCategory] = useState(setlist.category ?? "");
  const [rows, setRows] = useState(() => setlist.items.map(toRow));
  // Whether a drag handle is held down. A drag that starts anywhere else in
  // a row, such as on its buttons, is cancelled. (The browser picks what's
  // draggable on pointer down, before a re-render could switch it on.)
  const handleHeld = useRef(false);
  const [dragging, setDragging] = useState<number | null>(null);
  // The order when the drag began, put back if it's cancelled.
  const [beforeDrag, setBeforeDrag] = useState<Row[] | null>(null);
  const dropped = useRef(false);
  const [dialog, setDialog] = useState<"duplicate" | "delete" | null>(null);

  const dirty =
    name.trim() !== setlist.name ||
    (category.trim() || null) !== setlist.category ||
    rows.map((r) => itemValue(r.entry)).join() !== setlist.items.map(itemValue).join();

  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= rows.length) return;
    const next = [...rows];
    const [row] = next.splice(from, 1);
    next.splice(to, 0, row);
    setRows(next);
  };

  const add = (value: string) => {
    const [kind, id] = value.split(":");
    const song = kind === "song" && songs.find((s) => s.id === id);
    const selection = kind === "selection" && selections.find((s) => s.id === id);
    if (song) setRows([...rows, toRow({ kind: "song", item: song })]);
    if (selection) setRows([...rows, toRow({ kind: "selection", item: selection })]);
  };

  // Rows move live as the dragged one passes over them.
  const dragProps = (i: number) => ({
    draggable: true,
    onDragStart: (e: DragEvent) => {
      if (!handleHeld.current) {
        e.preventDefault();
        return;
      }
      e.dataTransfer.effectAllowed = "move";
      setDragging(i);
      setBeforeDrag(rows);
    },
    onDragOver: (e: DragEvent) => {
      if (dragging === null) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (dragging !== i) {
        move(dragging, i);
        setDragging(i);
      }
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      dropped.current = true;
    },
    onDragEnd: () => {
      // Escape, or a drop outside the list.
      if (!dropped.current && beforeDrag) setRows(beforeDrag);
      dropped.current = false;
      setDragging(null);
      setBeforeDrag(null);
      handleHeld.current = false;
    },
  });

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-line bg-bg-1 p-5 max-sm:p-4">
      <form onSubmit={submitKeepingFields(action)} className="contents">
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="setlistId" value={setlist.id} />
        {rows.map((row) => (
          <input key={row.key} type="hidden" name="items" value={itemValue(row.entry)} />
        ))}
        <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] items-end gap-4 max-sm:grid-cols-2">
          <Field label="Nombre" className="max-sm:col-span-2">
            <Input name="name" value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <Field label="Categoría">
            <Input name="category" value={category} onChange={(e) => setCategory(e.target.value)} />
          </Field>
          <Total seconds={totalSeconds(rows.map((r) => r.entry))} />
        </div>
        {rows.length > 0 ? (
          <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
            {rows.map((row, i) => (
              <ItemRow
                key={row.key}
                entry={row.entry}
                position={i}
                className={dragging === i ? "opacity-50" : ""}
                {...dragProps(i)}
                handle={
                  <span
                    className="w-5 shrink-0 cursor-grab text-ink-subtle max-sm:hidden pointer-coarse:hidden"
                    aria-hidden
                    onPointerDown={() => (handleHeld.current = true)}
                    onPointerUp={() => (handleHeld.current = false)}
                  >
                    <GripVertical {...iconProps} />
                  </span>
                }
                actions={
                  <>
                    <span className="flex gap-1 sm:pointer-fine:opacity-0 sm:pointer-fine:group-focus-within:opacity-100 sm:pointer-fine:group-hover:opacity-100">
                      <IconButton
                        square
                        aria-label={`Subir ${row.entry.item.name}`}
                        aria-disabled={i === 0}
                        onClick={() => move(i, i - 1)}
                        className={EDGE_BUTTON}
                      >
                        <ArrowUp {...iconProps} />
                      </IconButton>
                      <IconButton
                        square
                        aria-label={`Bajar ${row.entry.item.name}`}
                        aria-disabled={i === rows.length - 1}
                        onClick={() => move(i, i + 1)}
                        className={EDGE_BUTTON}
                      >
                        <ArrowDown {...iconProps} />
                      </IconButton>
                    </span>
                    <IconButton
                      square
                      aria-label={`Sacar ${row.entry.item.name}`}
                      onClick={() => setRows(rows.filter((_, j) => j !== i))}
                    >
                      <X {...iconProps} />
                    </IconButton>
                  </>
                }
              />
            ))}
          </ol>
        ) : (
          <p className="m-0 text-[14px]/[20px] text-ink-muted">
            Esta setlist está vacía. Agregá canciones y enganchados del repertorio.
          </p>
        )}
        <AddItem songs={songs} selections={selections} projectId={projectId} onAdd={add} />
        {state.error ? (
          <FormMessage tone="error">{state.error}</FormMessage>
        ) : (
          state.saved > 0 && !dirty && <FormMessage tone="info">Cambios guardados.</FormMessage>
        )}
        <div className="flex flex-wrap justify-end gap-3">
          <Button variant="ghost" onClick={() => setDialog("duplicate")}>
            <Copy {...iconProps} />
            Duplicar
          </Button>
          <Button variant="danger" onClick={() => setDialog("delete")}>
            <Trash2 {...iconProps} />
            Eliminar
          </Button>
          <Button type="submit" variant="primary" disabled={pending || !dirty}>
            {pending ? "Guardando…" : "Guardar setlist"}
          </Button>
        </div>
      </form>
      <Dialog
        open={dialog === "duplicate"}
        onClose={() => setDialog(null)}
        title="Duplicar setlist"
      >
        <DuplicateForm
          projectId={projectId}
          setlist={setlist}
          dirty={dirty}
          onClose={() => setDialog(null)}
        />
      </Dialog>
      <Dialog open={dialog === "delete"} onClose={() => setDialog(null)} title="Eliminar setlist">
        <DeleteForm projectId={projectId} setlist={setlist} onClose={() => setDialog(null)} />
      </Dialog>
    </section>
  );
}

// The chosen Setlist for Members who can't edit setlists.
export function SetlistView({ setlist }: { setlist: Setlist }) {
  return (
    <section className="flex flex-col gap-4 rounded-lg border border-line bg-bg-1 p-5 max-sm:p-4">
      <div className="flex items-end gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="m-0 text-title">{setlist.name}</h2>
          {setlist.category && (
            <span className="text-[13px]/[18px] text-ink-muted">{setlist.category}</span>
          )}
        </div>
        <Total seconds={setlist.durationSeconds} />
      </div>
      {setlist.items.length > 0 ? (
        <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
          {setlist.items.map((entry, i) => (
            <ItemRow key={i} entry={entry} position={i} />
          ))}
        </ol>
      ) : (
        <p className="m-0 text-[14px]/[20px] text-ink-muted">Esta setlist está vacía.</p>
      )}
    </section>
  );
}

function Total({ seconds }: { seconds: number }) {
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="text-[12px]/[16px] font-medium text-ink-muted">Total</span>
      <span className="font-mono text-stat">{formatTotal(seconds)}</span>
    </div>
  );
}

// One item in playing order: its number, title (an Enganchado marked so),
// intensity and duration. Under 640px the intensity and duration move under
// the title, which wraps instead of being cut.
function ItemRow({
  entry: { kind, item },
  position,
  handle,
  actions,
  className = "",
  ...props
}: {
  entry: SetlistItem;
  position: number;
  handle?: ReactNode;
  actions?: ReactNode;
  className?: string;
} & Omit<React.ComponentProps<"li">, "children">) {
  return (
    <li
      className={`group flex min-h-12 items-center gap-3 rounded-md border border-line bg-bg-2 py-2 pr-2 pl-3 max-sm:gap-2 ${className}`}
      {...props}
    >
      {handle}
      <span className="w-7 shrink-0 font-mono text-[13px]/[18px] text-ink-muted max-sm:w-5">
        {String(position + 1).padStart(2, "0")}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex min-w-0 items-center gap-x-2 max-sm:flex-wrap">
          <span className="truncate text-[14px]/[20px] font-medium max-sm:whitespace-normal">
            {item.name}
          </span>
          {kind === "selection" && <Tag>Enganchado</Tag>}
        </span>
        <span className="hidden text-[12px]/[16px] text-ink-muted max-sm:block">
          {INTENSITY_LABELS[item.intensity]} ·{" "}
          <span className="font-mono">{formatClock(item.durationSeconds)}</span>
        </span>
      </span>
      <span className="max-sm:hidden">
        <IntensityMeter intensity={item.intensity} />
      </span>
      <span className="w-14 shrink-0 text-right font-mono text-[13px]/[18px] max-sm:hidden">
        {formatClock(item.durationSeconds)}
      </span>
      {actions}
    </li>
  );
}

// Picks a Canción or Enganchado from the Repertoire and adds it at the end.
function AddItem({
  projectId,
  songs,
  selections,
  onAdd,
}: {
  projectId: string;
  songs: Song[];
  selections: Selection[];
  onAdd: (value: string) => void;
}) {
  if (songs.length + selections.length === 0) {
    return (
      <p className="m-0 text-[13px]/[18px] text-ink-muted">
        El repertorio está vacío. <Link href={`/p/${projectId}/repertorio`}>Agregá canciones</Link>{" "}
        para armar setlists.
      </p>
    );
  }
  return (
    <Select
      aria-label="Agregar canción o enganchado"
      value=""
      onChange={(e) => onAdd(e.target.value)}
    >
      <option value="">Agregar canción o enganchado…</option>
      {songs.length > 0 && (
        <optgroup label="Canciones">
          {songs.map((song) => (
            <option key={song.id} value={`song:${song.id}`}>
              {song.name} · {formatClock(song.durationSeconds)}
            </option>
          ))}
        </optgroup>
      )}
      {selections.length > 0 && (
        <optgroup label="Enganchados">
          {selections.map((selection) => (
            <option key={selection.id} value={`selection:${selection.id}`}>
              {selection.name} · {formatClock(selection.durationSeconds)}
            </option>
          ))}
        </optgroup>
      )}
    </Select>
  );
}

function DuplicateForm({
  projectId,
  setlist,
  dirty,
  onClose,
}: {
  projectId: string;
  setlist: Setlist;
  dirty: boolean;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState<SetlistActionState, FormData>(copySetlist, {});
  return (
    <form onSubmit={submitKeepingFields(action)} className="flex flex-col gap-4">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="setlistId" value={setlist.id} />
      <p className="m-0 text-[14px]/[20px] text-ink-muted">
        Copia <span className="font-medium text-ink">{setlist.name}</span> con su categoría y sus
        ítems, tal como está guardada.{dirty && " Los cambios sin guardar no se copian."}
      </p>
      <Field label="Nombre de la copia">
        <Input name="name" defaultValue={`${setlist.name} (copia)`} required data-autofocus />
      </Field>
      {state.error && <FormMessage tone="error">{state.error}</FormMessage>}
      <div className="flex justify-end gap-3">
        <Button variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" disabled={pending}>
          <Copy {...iconProps} />
          {pending ? "Duplicando…" : "Duplicar"}
        </Button>
      </div>
    </form>
  );
}

function DeleteForm({
  projectId,
  setlist,
  onClose,
}: {
  projectId: string;
  setlist: Setlist;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState<SetlistActionState, FormData>(removeSetlist, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="setlistId" value={setlist.id} />
      <p className="m-0 text-[14px]/[20px] text-ink-muted">
        ¿Eliminar <span className="font-medium text-ink">{setlist.name}</span>? Sus canciones y
        enganchados quedan en el repertorio. No se puede deshacer.
      </p>
      {state.error && <FormMessage tone="error">{state.error}</FormMessage>}
      <div className="flex justify-end gap-3">
        <Button variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" variant="danger" disabled={pending}>
          <Trash2 {...iconProps} />
          {pending ? "Eliminando…" : "Eliminar"}
        </Button>
      </div>
    </form>
  );
}
