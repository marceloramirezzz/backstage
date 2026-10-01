"use client";

import { ArrowDown, ArrowUp, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  createContext,
  use,
  useActionState,
  useCallback,
  useEffect,
  useEffectEvent,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { FormMessage } from "@/components/auth-screen.tsx";
import { Button, IconButton } from "@/components/ui/button.tsx";
import { Dialog } from "@/components/ui/dialog.tsx";
import { Field, Input, Select } from "@/components/ui/field.tsx";
import { iconProps } from "@/components/ui/icon-props.ts";
import { Menu } from "@/components/ui/menu.tsx";
import { formatClock } from "@/lib/format.ts";
import { INTENSITY_LABELS } from "@/lib/intensity-label.ts";
import { submitKeepingFields } from "@/lib/submit-keeping-fields.ts";
import { MIN_SELECTION_SONGS, type Selection } from "@/services/selections.ts";
import { INTENSITIES, type Song } from "@/services/songs.ts";
import {
  removeSelection,
  saveSelection,
  type DeleteState,
  type SelectionFormState,
} from "./actions.ts";

// Opens the form for a new Enganchado, built from the Repertoire's `songs`.
export function NewSelectionButton({ projectId, songs }: { projectId: string; songs: Song[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Plus {...iconProps} />
        Nuevo enganchado
      </Button>
      <SelectionDialog
        projectId={projectId}
        songs={songs}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

type SelectionDialogKind = "edit" | "delete";

const OpenSelectionDialog = createContext<(kind: SelectionDialogKind, s: Selection) => void>(
  () => {},
);

// Holds the one edit and one delete dialog every Enganchado row's menu opens,
// as SongDialogs does for Canciones.
export function SelectionDialogs({
  projectId,
  songs,
  children,
}: {
  projectId: string;
  songs: Song[];
  children: ReactNode;
}) {
  const [dialog, setDialog] = useState<SelectionDialogKind | null>(null);
  // Kept after closing, so the closing dialog still has its Enganchado.
  const [selection, setSelection] = useState<Selection | null>(null);
  const open = useCallback((kind: SelectionDialogKind, selection: Selection) => {
    setSelection(selection);
    setDialog(kind);
  }, []);
  const close = useCallback(() => setDialog(null), []);
  return (
    <OpenSelectionDialog value={open}>
      {children}
      {selection && (
        <>
          <SelectionDialog
            projectId={projectId}
            songs={songs}
            selection={selection}
            open={dialog === "edit"}
            onClose={close}
          />
          <Dialog open={dialog === "delete"} onClose={close} title="Eliminar enganchado">
            <DeleteSelectionForm projectId={projectId} selection={selection} onClose={close} />
          </Dialog>
        </>
      )}
    </OpenSelectionDialog>
  );
}

// An Enganchado row's "more actions": edit it, or delete it after confirming.
export function SelectionMenu({ selection }: { selection: Selection }) {
  const open = use(OpenSelectionDialog);
  return (
    <Menu
      label={`Más acciones para ${selection.name}`}
      items={[
        {
          label: "Editar",
          icon: <Pencil {...iconProps} />,
          onSelect: () => open("edit", selection),
        },
        {
          label: "Eliminar",
          icon: <Trash2 {...iconProps} />,
          danger: true,
          onSelect: () => open("delete", selection),
        },
      ]}
    />
  );
}

function SelectionDialog(props: {
  projectId: string;
  songs: Song[];
  selection?: Selection;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={props.open}
      onClose={props.onClose}
      title={props.selection ? "Editar enganchado" : "Nuevo enganchado"}
    >
      <SelectionForm {...props} />
    </Dialog>
  );
}

function SelectionForm({
  projectId,
  songs,
  selection,
  onClose,
}: {
  projectId: string;
  songs: Song[];
  selection?: Selection;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState<SelectionFormState, FormData>(saveSelection, {
    saved: 0,
  });
  const [chosen, setChosen] = useState<Song[]>(selection?.songs ?? []);
  const [tooFew, setTooFew] = useState(false);

  const onSaved = useEffectEvent(onClose);
  useEffect(() => {
    if (state.saved) onSaved();
  }, [state.saved]);

  const send = submitKeepingFields(action);
  const submit = (e: FormEvent<HTMLFormElement>) => {
    if (chosen.length < MIN_SELECTION_SONGS) {
      e.preventDefault();
      setTooFew(true);
      return;
    }
    send(e);
  };

  const choose = (songs: Song[]) => {
    setChosen(songs);
    setTooFew(false);
  };

  const duration = selection?.durationSeconds;
  const error = tooFew ? "Un enganchado lleva al menos dos canciones." : state.error;
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <input type="hidden" name="projectId" value={projectId} />
      {selection && <input type="hidden" name="selectionId" value={selection.id} />}
      {chosen.map((song) => (
        <input key={song.id} type="hidden" name="songIds" value={song.id} />
      ))}
      <Field label="Título">
        <Input
          name="name"
          defaultValue={selection?.name}
          placeholder="Ej.: Enganchado cumbia"
          required
          data-autofocus
        />
      </Field>
      <Field label="Intensidad">
        <Select name="intensity" defaultValue={selection?.intensity ?? "medium"} required>
          {INTENSITIES.map((intensity) => (
            <option key={intensity} value={intensity}>
              {INTENSITY_LABELS[intensity]}
            </option>
          ))}
        </Select>
      </Field>
      <fieldset className="m-0 grid grid-cols-2 gap-4 border-0 p-0">
        <legend className="sr-only">Duración</legend>
        <Field label="Duración: minutos">
          <Input
            name="minutes"
            type="number"
            inputMode="numeric"
            min={0}
            max={99}
            defaultValue={duration === undefined ? "" : Math.floor(duration / 60)}
            placeholder="12"
            className="font-mono"
          />
        </Field>
        <Field label="Segundos">
          <Input
            name="seconds"
            type="number"
            inputMode="numeric"
            min={0}
            max={59}
            defaultValue={duration === undefined ? "" : duration % 60}
            placeholder="30"
            className="font-mono"
          />
        </Field>
      </fieldset>
      <SongPicker songs={songs} chosen={chosen} onChange={choose} />
      {error && <FormMessage tone="error">{error}</FormMessage>}
      <div className="flex justify-end gap-3">
        <Button variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Guardando…" : selection ? "Guardar cambios" : "Agregar enganchado"}
        </Button>
      </div>
    </form>
  );
}

// The Enganchado's Canciones in playing order: add from the Repertoire, move
// up or down, take out. Each Canción plays at most once.
function SongPicker({
  songs,
  chosen,
  onChange,
}: {
  songs: Song[];
  chosen: Song[];
  onChange: (songs: Song[]) => void;
}) {
  const available = songs.filter((song) => !chosen.some((c) => c.id === song.id));
  const move = (from: number, to: number) => {
    const next = [...chosen];
    const [song] = next.splice(from, 1);
    next.splice(to, 0, song);
    onChange(next);
  };
  return (
    <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
      <legend className="mb-1.5 p-0 text-[12px]/[16px] font-medium text-ink-muted">
        Canciones, en orden
      </legend>
      {chosen.length > 0 && (
        <ol className="m-0 flex list-none flex-col rounded-md border border-line p-0">
          {chosen.map((song, i) => (
            <li
              key={song.id}
              className="flex items-center gap-2 border-line py-1.5 pr-1.5 pl-3 not-first:border-t"
            >
              <span className="w-4 font-mono text-[12px]/[16px] text-ink-subtle">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate text-[14px]/[20px]">{song.name}</span>
              <span className="font-mono text-[12px]/[16px] text-ink-muted">
                {formatClock(song.durationSeconds)}
              </span>
              <IconButton
                square
                aria-label={`Subir ${song.name}`}
                disabled={i === 0}
                onClick={() => move(i, i - 1)}
                className="disabled:invisible"
              >
                <ArrowUp {...iconProps} />
              </IconButton>
              <IconButton
                square
                aria-label={`Bajar ${song.name}`}
                disabled={i === chosen.length - 1}
                onClick={() => move(i, i + 1)}
                className="disabled:invisible"
              >
                <ArrowDown {...iconProps} />
              </IconButton>
              <IconButton
                square
                aria-label={`Sacar ${song.name}`}
                onClick={() => onChange(chosen.filter((_, j) => j !== i))}
              >
                <X {...iconProps} />
              </IconButton>
            </li>
          ))}
        </ol>
      )}
      {songs.length < MIN_SELECTION_SONGS ? (
        <p className="m-0 text-[13px]/[18px] text-ink-muted">
          Agregá al menos dos canciones al repertorio para armar un enganchado.
        </p>
      ) : (
        <Select
          aria-label="Agregar canción"
          value=""
          disabled={available.length === 0}
          onChange={(e) => {
            const song = songs.find((s) => s.id === e.target.value);
            if (song) onChange([...chosen, song]);
          }}
        >
          <option value="">
            {available.length ? "Agregar canción…" : "Ya están todas las canciones"}
          </option>
          {available.map((song) => (
            <option key={song.id} value={song.id}>
              {song.name}
            </option>
          ))}
        </Select>
      )}
    </fieldset>
  );
}

function DeleteSelectionForm({
  projectId,
  selection,
  onClose,
}: {
  projectId: string;
  selection: Selection;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState<DeleteState, FormData>(removeSelection, {
    deleted: 0,
  });

  const onDeleted = useEffectEvent(onClose);
  useEffect(() => {
    if (state.deleted) onDeleted();
  }, [state.deleted]);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="selectionId" value={selection.id} />
      <p className="m-0 text-[14px]/[20px] text-ink-muted">
        ¿Eliminar <span className="font-medium text-ink">{selection.name}</span> del repertorio?
        Sus canciones quedan en el repertorio. No se puede deshacer.
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
