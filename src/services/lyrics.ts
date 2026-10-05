import type { Pool } from "pg";
import type { User } from "./accounts.ts";
import { ServiceError } from "./errors.ts";
import { isUuid } from "./ids.ts";
import { getPermissions, requirePermission } from "./permissions.ts";

// The longest lyrics a Song or Selection can hold.
export const MAX_LYRICS_LENGTH = 20_000;

// What the teleprompter can play.
export type TeleprompterSource = {
  kind: "song" | "selection" | "setlist" | "event";
  id: string;
};

// One screen of the teleprompter: a Song or Selection with its lyrics.
export interface TeleprompterItem {
  kind: "song" | "selection";
  name: string;
  key: string | null;
  // Null while it has none.
  lyrics: string | null;
}

export interface Teleprompter {
  // What's being played: the Song, Selection, Setlist or Event name.
  title: string;
  items: TeleprompterItem[];
}

const notFound = () => new ServiceError("not_found", "Nothing to show in the teleprompter");

// The lyrics to play for a Song, a Selection, a template Setlist (as its
// Songs and Selections are now) or an Event's Setlist (as it was when copied).
// Any Member can open it.
export async function loadTeleprompter(
  pool: Pool,
  user: User,
  projectId: string,
  source: TeleprompterSource,
): Promise<Teleprompter> {
  await getPermissions(pool, user, projectId); // Members only
  if (!isUuid(source.id)) throw notFound();
  const params = [source.id, projectId];
  switch (source.kind) {
    case "song": {
      const { rows } = await pool.query<TeleprompterItem & { title: string }>(
        `SELECT 'song' AS kind, name AS title, name, key, lyrics FROM songs
         WHERE id = $1 AND project_id = $2`,
        params,
      );
      if (!rows[0]) throw notFound();
      const { title, ...item } = rows[0];
      return { title, items: [item] };
    }
    case "selection": {
      const { rows } = await pool.query<TeleprompterItem & { title: string }>(
        `SELECT 'selection' AS kind, name AS title, name, NULL::text AS key, lyrics
         FROM selections WHERE id = $1 AND project_id = $2`,
        params,
      );
      if (!rows[0]) throw notFound();
      const { title, ...item } = rows[0];
      return { title, items: [item] };
    }
    case "setlist": {
      const { rows } = await pool.query<Teleprompter>(
        `SELECT sl.name AS title, coalesce((SELECT json_agg(json_build_object(
             'kind', CASE WHEN si.song_id IS NOT NULL THEN 'song' ELSE 'selection' END,
             'name', coalesce(s.name, sel.name), 'key', s.key,
             'lyrics', coalesce(s.lyrics, sel.lyrics)) ORDER BY si.position)
           FROM setlist_items si
           LEFT JOIN songs s ON s.id = si.song_id
           LEFT JOIN selections sel ON sel.id = si.selection_id
           WHERE si.setlist_id = sl.id), '[]') AS items
         FROM setlists sl WHERE sl.id = $1 AND sl.project_id = $2`,
        params,
      );
      if (!rows[0]) throw notFound();
      return rows[0];
    }
    case "event": {
      const { rows } = await pool.query<Teleprompter>(
        `SELECT e.name AS title, coalesce((SELECT json_agg(json_build_object(
             'kind', i.kind, 'name', i.name, 'key', i.key, 'lyrics', i.lyrics)
             ORDER BY i.position)
           FROM event_setlist_items i WHERE i.event_id = e.id), '[]') AS items
         FROM events e WHERE e.id = $1 AND e.project_id = $2`,
        params,
      );
      if (!rows[0]) throw notFound();
      return rows[0];
    }
  }
}

// Replaces a Song's or Selection's lyrics (blank clears them). Setlists show
// the change; Event Setlist copies keep theirs.
export async function saveLyrics(
  pool: Pool,
  user: User,
  projectId: string,
  target: { kind: "song" | "selection"; id: string },
  lyrics: string,
): Promise<void> {
  await requirePermission(pool, user, projectId, "editRepertoireSetlistsEvents");
  if (!isUuid(target.id)) throw notFound();
  const text = typeof lyrics === "string" ? lyrics.replace(/\r\n?/g, "\n").trimEnd() : "";
  if (text.length > MAX_LYRICS_LENGTH) {
    throw new ServiceError("invalid_input", `Lyrics can be up to ${MAX_LYRICS_LENGTH} characters`);
  }
  const table = target.kind === "song" ? "songs" : "selections";
  const { rowCount } = await pool.query(
    `UPDATE ${table} SET lyrics = CASE WHEN btrim($3) = '' THEN NULL ELSE $3 END, updated_at = now()
     WHERE id = $1 AND project_id = $2`,
    [target.id, projectId, text],
  );
  if (!rowCount) throw notFound();
}
