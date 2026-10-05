"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import {
  createContext,
  use,
  useActionState,
  useCallback,
  useEffect,
  useEffectEvent,
  useState,
  type ReactNode,
} from "react";
import { FormMessage } from "@/components/auth-screen.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Dialog } from "@/components/ui/dialog.tsx";
import { Field, Input, Select } from "@/components/ui/field.tsx";
import { iconProps } from "@/components/ui/icon-props.ts";
import { Menu } from "@/components/ui/menu.tsx";
import { INTENSITY_LABELS } from "@/lib/intensity-label.ts";
import { submitKeepingFields } from "@/lib/submit-keeping-fields.ts";
import { INTENSITIES, NOTES, SONG_KEYS, type Song } from "@/services/songs.ts";
import { removeSong, saveSong, type DeleteState, type SongFormState } from "./actions.ts";

// The page's primary action: opens the form for a new Canción.
export function NewSongButton({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        <Plus {...iconProps} />
        Nueva canción
      </Button>
      <SongDialog projectId={projectId} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

type SongDialogKind = "edit" | "delete";

const OpenSongDialog = createContext<(kind: SongDialogKind, song: Song) => void>(() => {});

// Holds the one edit and one delete dialog every row's menu opens, rather
// than a pair per row (each row has a menu in the table and in the cards).
export function SongDialogs({ projectId, children }: { projectId: string; children: ReactNode }) {
  const [dialog, setDialog] = useState<SongDialogKind | null>(null);
  // Kept after closing, so the closing dialog still has its Song.
  const [song, setSong] = useState<Song | null>(null);
  const open = useCallback((kind: SongDialogKind, song: Song) => {
    setSong(song);
    setDialog(kind);
  }, []);
  const close = useCallback(() => setDialog(null), []);
  return (
    <OpenSongDialog value={open}>
      {children}
      {song && (
        <>
          <SongDialog projectId={projectId} song={song} open={dialog === "edit"} onClose={close} />
          <Dialog open={dialog === "delete"} onClose={close} title="Eliminar canción">
            <DeleteSongForm projectId={projectId} song={song} onClose={close} />
          </Dialog>
        </>
      )}
    </OpenSongDialog>
  );
}

// A row's "more actions": edit the Canción, or delete it after confirming.
export function SongMenu({ song }: { song: Song }) {
  const open = use(OpenSongDialog);
  return (
    <Menu
      label={`Más acciones para ${song.name}`}
      items={[
        { label: "Editar", icon: <Pencil {...iconProps} />, onSelect: () => open("edit", song) },
        {
          label: "Eliminar",
          icon: <Trash2 {...iconProps} />,
          danger: true,
          onSelect: () => open("delete", song),
        },
      ]}
    />
  );
}

function SongDialog(props: { projectId: string; song?: Song; open: boolean; onClose: () => void }) {
  return (
    <Dialog
      open={props.open}
      onClose={props.onClose}
      title={props.song ? "Editar canción" : "Nueva canción"}
    >
      <SongForm {...props} />
    </Dialog>
  );
}

function SongForm({
  projectId,
  song,
  onClose,
}: {
  projectId: string;
  song?: Song;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState<SongFormState, FormData>(saveSong, { saved: 0 });

  const onSaved = useEffectEvent(onClose);
  useEffect(() => {
    if (state.saved) onSaved();
  }, [state.saved]);

  const duration = song?.durationSeconds;
  return (
    <form onSubmit={submitKeepingFields(action)} className="flex flex-col gap-4">
      <input type="hidden" name="projectId" value={projectId} />
      {song && <input type="hidden" name="songId" value={song.id} />}
      <Field label="Título">
        <Input name="name" defaultValue={song?.name} placeholder="Ej.: Colegiala" required data-autofocus />
      </Field>
      <KeyPicker initial={song?.key ?? ""} />
      <Field label="Intensidad">
        <Select name="intensity" defaultValue={song?.intensity ?? "medium"} required>
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
            placeholder="3"
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
            placeholder="45"
            className="font-mono"
          />
        </Field>
      </fieldset>
      {state.error && <FormMessage tone="error">{state.error}</FormMessage>}
      <div className="flex justify-end gap-3">
        <Button variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Guardando…" : song ? "Guardar cambios" : "Agregar canción"}
        </Button>
      </div>
    </form>
  );
}

const tile =
  "h-9 cursor-pointer rounded-md border border-line bg-bg-2 font-mono text-[13px]/[18px] font-medium text-ink-muted hover:text-ink aria-pressed:border-transparent aria-pressed:bg-spotlight aria-pressed:text-on-spotlight";

// The Tono as a box of the 12 notes (6 × 2) plus a Menor toggle. Picking the
// chosen note again leaves the Tono unset. Submits as `key`, e.g. "F#m".
function KeyPicker({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  const [minor, setMinor] = useState(initial.endsWith("m"));
  const note = minor ? value.slice(0, -1) : value;
  // A Tono saved before the list existed: kept until a note is picked.
  const legacy = value !== "" && !SONG_KEYS.includes(value);
  const pick = (next: string) => setValue(next === note ? "" : next + (minor ? "m" : ""));
  const toggleMinor = () => {
    setMinor(!minor);
    if (value && !legacy) setValue(minor ? note : `${note}m`);
  };
  return (
    <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
      <legend className="float-left mb-1.5 p-0 text-[12px]/[16px] font-medium text-ink-muted">
        Tono (opcional)
      </legend>
      <input type="hidden" name="key" value={value} />
      <div className="clear-both grid grid-cols-6 gap-1.5">
        {NOTES.map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={!legacy && n === note}
            onClick={() => pick(n)}
            className={tile}
          >
            {n}
          </button>
        ))}
      </div>
      <button
        type="button"
        aria-pressed={minor}
        onClick={toggleMinor}
        className={`${tile} w-fit px-4 font-sans`}
      >
        Menor
      </button>
      {legacy && (
        <span className="text-[12px]/[16px] text-ink-muted">
          Tono guardado: <span className="font-mono text-ink">{value}</span>. Elegí una nota para
          reemplazarlo.
        </span>
      )}
    </fieldset>
  );
}

function DeleteSongForm({
  projectId,
  song,
  onClose,
}: {
  projectId: string;
  song: Song;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState<DeleteState, FormData>(removeSong, {
    deleted: 0,
  });

  const onDeleted = useEffectEvent(onClose);
  useEffect(() => {
    if (state.deleted) onDeleted();
  }, [state.deleted]);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="songId" value={song.id} />
      <p className="m-0 text-[14px]/[20px] text-ink-muted">
        ¿Eliminar <span className="font-medium text-ink">{song.name}</span> del repertorio? No se
        puede deshacer.
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
