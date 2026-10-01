"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import {
  createContext,
  startTransition,
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
import { Button } from "@/components/ui/button.tsx";
import { Dialog } from "@/components/ui/dialog.tsx";
import { Field, Input, Select } from "@/components/ui/field.tsx";
import { iconProps } from "@/components/ui/icon-props.ts";
import { Menu } from "@/components/ui/menu.tsx";
import { INTENSITY_LABELS } from "@/lib/intensity-label.ts";
import { INTENSITIES, type Song } from "@/services/songs.ts";
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

  // Submitted by hand so a failed save keeps what was typed (a form action
  // would reset the fields).
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => action(data));
  };

  const duration = song?.durationSeconds;
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <input type="hidden" name="projectId" value={projectId} />
      {song && <input type="hidden" name="songId" value={song.id} />}
      <Field label="Título">
        <Input name="name" defaultValue={song?.name} placeholder="Ej.: Colegiala" required data-autofocus />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Tono (opcional)">
          <Input name="key" defaultValue={song?.key ?? ""} placeholder="Ej.: Am" className="font-mono" />
        </Field>
        <Field label="Intensidad">
          <Select name="intensity" defaultValue={song?.intensity ?? "medium"} required>
            {INTENSITIES.map((intensity) => (
              <option key={intensity} value={intensity}>
                {INTENSITY_LABELS[intensity]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
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
