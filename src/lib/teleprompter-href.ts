import type { TeleprompterSource } from "@/services/lyrics.ts";

// The query parameter that names each kind of source.
export const SOURCE_PARAMS = {
  song: "cancion",
  selection: "enganchado",
  setlist: "setlist",
  event: "evento",
} as const satisfies Record<TeleprompterSource["kind"], string>;

export const teleprompterHref = (projectId: string, { kind, id }: TeleprompterSource) =>
  `/teleprompter/${projectId}?${SOURCE_PARAMS[kind]}=${id}`;
