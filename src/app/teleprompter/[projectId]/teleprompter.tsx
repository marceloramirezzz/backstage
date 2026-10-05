"use client";

import {
  ChevronLeft,
  ChevronRight,
  Gauge,
  Minus,
  Pause,
  Pencil,
  Play,
  Plus,
  Type,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import { FormMessage } from "@/components/auth-screen.tsx";
import { Button, IconButton } from "@/components/ui/button.tsx";
import { iconProps } from "@/components/ui/icon-props.ts";
import { submitKeepingFields } from "@/lib/submit-keeping-fields.ts";
import type { TeleprompterItem } from "@/services/lyrics.ts";
import { saveLyricsAction, type LyricsFormState } from "./actions.ts";

const FONT_SIZES = [24, 28, 32, 40, 48, 56, 64, 80, 96];
const DEFAULT_FONT = 3;
// Pixels per second the lyrics scroll at; one step per press.
const SPEEDS = [8, 14, 20, 28, 36, 48, 64, 84, 110, 140];
const DEFAULT_SPEED = 3;

const SETTINGS_KEY = "teleprompter-settings";

// The speed and text size last used on this device, as step indexes. Storage
// can be missing or blocked, so a failure just means the defaults.
function readSettings(): { speed: number; font: number } {
  const fallback = { speed: DEFAULT_SPEED, font: DEFAULT_FONT };
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null");
    const step = (value: unknown, length: number, otherwise: number) =>
      Number.isInteger(value) && (value as number) >= 0 && (value as number) < length
        ? (value as number)
        : otherwise;
    return {
      speed: step(saved?.speed, SPEEDS.length, fallback.speed),
      font: step(saved?.font, FONT_SIZES.length, fallback.font),
    };
  } catch {
    return fallback;
  }
}

// Lyrics full screen on a dark stage: auto-scroll with a speed, text size,
// and Anterior / Siguiente through a Setlist's Songs. Whoever may edit the
// repertoire can also write the lyrics of a single Canción or Enganchado here.
export function Teleprompter({
  projectId,
  title,
  items,
  editTarget,
}: {
  projectId: string;
  title: string;
  items: TeleprompterItem[];
  // Set when these lyrics can be edited here: who, and which one.
  editTarget: { kind: "song" | "selection"; id: string } | null;
}) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(DEFAULT_SPEED);
  const [font, setFont] = useState(DEFAULT_FONT);
  const [editing, setEditing] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  // Not read until the page is on the screen, so the server's HTML matches.
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  useEffect(() => {
    const saved = readSettings();
    setSpeed(saved.speed);
    setFont(saved.font);
    setSettingsLoaded(true);
  }, []);
  useEffect(() => {
    if (!settingsLoaded) return;
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ speed, font }));
    } catch {}
  }, [settingsLoaded, speed, font]);

  const item = items[index];
  const last = index === items.length - 1;

  const goTo = useCallback(
    (next: number) => {
      setIndex(Math.min(Math.max(next, 0), items.length - 1));
      setPlaying(false);
      scroller.current?.scrollTo({ top: 0 });
    },
    [items.length],
  );
  const exit = () => {
    if (window.history.length > 1) router.back();
    else router.push(`/p/${projectId}/repertorio`);
  };

  // Scrolls by elapsed time at a fractional position: assigning `scrollTop`
  // can round, which would stall a slow speed. Stops at the end.
  useEffect(() => {
    const el = scroller.current;
    if (!playing || !el) return;
    let position = el.scrollTop;
    let before = performance.now();
    let frame = requestAnimationFrame(function step(now) {
      position += ((now - before) / 1000) * SPEEDS[speed];
      before = now;
      el.scrollTop = position;
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 1) setPlaying(false);
      else frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [playing, speed, font, index]);

  // iOS Safari ignores the viewport's no-zoom, but its pinch fires this.
  useEffect(() => {
    const block = (e: Event) => e.preventDefault();
    document.addEventListener("gesturestart", block);
    return () => document.removeEventListener("gesturestart", block);
  }, []);

  // Keeps the screen on while playing a gig.
  useEffect(() => {
    let lock: WakeLockSentinel | undefined;
    let released = false;
    const request = () =>
      navigator.wakeLock
        ?.request("screen")
        .then((sentinel) => {
          if (released) void sentinel.release();
          else lock = sentinel;
        })
        .catch(() => {});
    const onVisible = () => document.visibilityState === "visible" && request();
    void request();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      released = true;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release();
    };
  }, []);

  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (editing || e.target instanceof HTMLTextAreaElement) return;
    if (e.key === " ") {
      e.preventDefault();
      setPlaying((p) => !p);
    } else if (e.key === "ArrowRight") goTo(index + 1);
    else if (e.key === "ArrowLeft") goTo(index - 1);
    else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSpeed((s) => Math.min(s + 1, SPEEDS.length - 1));
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSpeed((s) => Math.max(s - 1, 0));
    } else if (e.key === "Escape") exit();
  });
  useEffect(() => {
    const listener = (e: KeyboardEvent) => onKey(e);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  return (
    <div
      className="flex h-dvh touch-pan-y flex-col bg-black text-white"
      style={{ colorScheme: "dark" }}
    >
      <header className="flex items-center gap-3 border-b border-white/15 px-4 py-3">
        <IconButton aria-label="Salir del teleprompter" onClick={exit} className="text-white">
          <X {...iconProps} />
        </IconButton>
        <div className="min-w-0 flex-1">
          <p className="m-0 truncate text-[16px]/[22px] font-medium">{item.name}</p>
          <p className="m-0 truncate text-[12px]/[16px] text-white/60">
            {items.length > 1 && `${index + 1} de ${items.length} · ${title}`}
            {items.length === 1 && item.key && `Tono ${item.key}`}
            {items.length > 1 && item.key && ` · Tono ${item.key}`}
          </p>
        </div>
        {editTarget && !editing && (
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
            <Pencil {...iconProps} />
            {item.lyrics ? "Editar letra" : "Agregar letra"}
          </Button>
        )}
      </header>

      {editing && editTarget ? (
        <LyricsEditor
          projectId={projectId}
          target={editTarget}
          initial={item.lyrics ?? ""}
          onClose={() => setEditing(false)}
        />
      ) : (
        <>
          <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-6 py-[40vh] max-sm:px-4">
            {item.lyrics ? (
              <p
                className="m-0 max-w-[28em] text-left font-medium whitespace-pre-wrap"
                style={{ fontSize: FONT_SIZES[font], lineHeight: 1.35 }}
              >
                {item.lyrics}
              </p>
            ) : (
              <p className="m-0 text-left text-[18px]/[26px] text-white/60">
                Esta {item.kind === "selection" ? "enganchado" : "canción"} todavía no tiene letra.
              </p>
            )}
          </div>
          <footer className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 border-t border-white/15 px-4 py-3">
            <div className="flex items-center gap-2">
              <IconButton
                aria-label="Anterior"
                disabled={index === 0}
                onClick={() => goTo(index - 1)}
                className="text-white disabled:opacity-40"
              >
                <ChevronLeft {...iconProps} />
              </IconButton>
              <Button variant="primary" onClick={() => setPlaying(!playing)}>
                {playing ? <Pause {...iconProps} /> : <Play {...iconProps} />}
                {playing ? "Pausar" : "Desplazar"}
              </Button>
              <IconButton
                aria-label="Siguiente"
                disabled={last}
                onClick={() => goTo(index + 1)}
                className="text-white disabled:opacity-40"
              >
                <ChevronRight {...iconProps} />
              </IconButton>
            </div>
            <Stepper
              icon={<Gauge {...iconProps} />}
              label="Velocidad"
              value={`${speed + 1}/${SPEEDS.length}`}
              onLess={() => setSpeed(Math.max(speed - 1, 0))}
              onMore={() => setSpeed(Math.min(speed + 1, SPEEDS.length - 1))}
            />
            <Stepper
              icon={<Type {...iconProps} />}
              label="Tamaño del texto"
              value={`${FONT_SIZES[font]}`}
              onLess={() => setFont(Math.max(font - 1, 0))}
              onMore={() => setFont(Math.min(font + 1, FONT_SIZES.length - 1))}
            />
          </footer>
        </>
      )}
    </div>
  );
}

function Stepper({
  icon,
  label,
  value,
  onLess,
  onMore,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onLess: () => void;
  onMore: () => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex items-center gap-2 text-white/80">
      {icon}
      <IconButton aria-label={`${label}: menos`} onClick={onLess} className="text-white">
        <Minus {...iconProps} />
      </IconButton>
      <span className="min-w-12 text-center font-mono text-[13px]/[18px]">{value}</span>
      <IconButton aria-label={`${label}: más`} onClick={onMore} className="text-white">
        <Plus {...iconProps} />
      </IconButton>
    </div>
  );
}

function LyricsEditor({
  projectId,
  target,
  initial,
  onClose,
}: {
  projectId: string;
  target: { kind: "song" | "selection"; id: string };
  initial: string;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState<LyricsFormState, FormData>(saveLyricsAction, {
    saved: 0,
  });
  const onSaved = useEffectEvent(onClose);
  useEffect(() => {
    if (state.saved) onSaved();
  }, [state.saved]);

  return (
    <form
      onSubmit={submitKeepingFields(action)}
      className="flex min-h-0 flex-1 flex-col gap-3 p-4"
    >
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="kind" value={target.kind} />
      <input type="hidden" name="id" value={target.id} />
      <label className="flex min-h-0 flex-1 flex-col gap-1.5 text-[12px]/[16px] font-medium text-white/70">
        Letra
        <textarea
          name="lyrics"
          defaultValue={initial}
          autoFocus
          spellCheck={false}
          placeholder="Pegá o escribí la letra. Los saltos de línea se respetan."
          className="min-h-0 flex-1 resize-none rounded-md border border-white/25 bg-white/5 p-3 text-[16px]/[24px] text-white placeholder:text-white/40"
        />
      </label>
      {state.error && <FormMessage tone="error">{state.error}</FormMessage>}
      <div className="flex justify-end gap-3">
        <Button variant="ghost" onClick={onClose} className="text-white">
          Cancelar
        </Button>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Guardando…" : "Guardar letra"}
        </Button>
      </div>
    </form>
  );
}
