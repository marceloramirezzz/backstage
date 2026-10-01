import type { Pool, PoolClient } from "pg";
import type { User } from "./accounts.ts";
import { FOREIGN_KEY_VIOLATION, isViolation, ServiceError } from "./errors.ts";
import { isUuid } from "./ids.ts";
import { getPermissions, requirePermission } from "./permissions.ts";
import { SELECTION_COLUMNS, type Selection } from "./selections.ts";
import type { Song } from "./songs.ts";
import { inTransaction } from "./transaction.ts";

// One entry of a Setlist, as the Song or Selection is now: editing either
// shows here.
export type SetlistItem = { kind: "song"; item: Song } | { kind: "selection"; item: Selection };

// A template Setlist: an ordered list of Songs and Selections.
export interface Setlist {
  id: string;
  name: string;
  // Free text for the whole list; null when there's none.
  category: string | null;
  // In playing order. The same Song or Selection may come back.
  items: SetlistItem[];
  // The sum of its items' durations: the only thing derived from them.
  durationSeconds: number;
}

// Points at a Song or Selection of the Project.
export interface SetlistItemRef {
  kind: SetlistItem["kind"];
  id: string;
}

export interface SetlistInput {
  name: string;
  category?: string | null;
  items: SetlistItemRef[];
}

const ITEM_KINDS: SetlistItem["kind"][] = ["song", "selection"];

// Expects the setlists table aliased as `sl`.
const SETLIST_COLUMNS = `sl.id, sl.name, sl.category,
  (SELECT coalesce(json_agg(CASE
       WHEN si.song_id IS NOT NULL THEN json_build_object('kind', 'song', 'item',
         json_build_object('id', s.id, 'name', s.name, 'key', s.key,
           'durationSeconds', s.duration_seconds, 'intensity', s.intensity))
       ELSE json_build_object('kind', 'selection', 'item',
         (SELECT row_to_json(x) FROM (SELECT ${SELECTION_COLUMNS} FROM selections sel
            WHERE sel.id = si.selection_id) x))
     END ORDER BY si.position), '[]')
   FROM setlist_items si LEFT JOIN songs s ON s.id = si.song_id
   WHERE si.setlist_id = sl.id) AS items,
  (SELECT coalesce(sum(coalesce(s.duration_seconds, sel.duration_seconds)), 0)::int
   FROM setlist_items si
   LEFT JOIN songs s ON s.id = si.song_id
   LEFT JOIN selections sel ON sel.id = si.selection_id
   WHERE si.setlist_id = sl.id) AS "durationSeconds"`;

// The Project's Setlists by name. Any Member can browse them.
export async function listSetlists(pool: Pool, user: User, projectId: string): Promise<Setlist[]> {
  await getPermissions(pool, user, projectId); // Members only
  const { rows } = await pool.query<Setlist>(
    `SELECT ${SETLIST_COLUMNS} FROM setlists sl WHERE sl.project_id = $1
     ORDER BY lower(unaccent(sl.name)), sl.id`,
    [projectId],
  );
  return rows;
}

export async function createSetlist(
  pool: Pool,
  user: User,
  projectId: string,
  input: SetlistInput,
): Promise<Setlist> {
  await requirePermission(pool, user, projectId, "editRepertoireSetlistsEvents");
  const { name, category, items } = validSetlistInput(input);
  return inTransaction(pool, async (client) => {
    const { rows } = await client.query<{ id: string }>(
      "INSERT INTO setlists (project_id, name, category) VALUES ($1, $2, $3) RETURNING id",
      [projectId, name, category],
    );
    await insertItems(client, projectId, rows[0].id, items);
    return getSetlist(client, rows[0].id);
  });
}

// Replaces a Setlist's name, category and items, all or none. Reordering is
// sending the same items in their new order.
export async function updateSetlist(
  pool: Pool,
  user: User,
  projectId: string,
  setlistId: string,
  input: SetlistInput,
): Promise<Setlist> {
  await requirePermission(pool, user, projectId, "editRepertoireSetlistsEvents");
  const { name, category, items } = validSetlistInput(input);
  if (!isUuid(setlistId)) throw new ServiceError("not_found", "Setlist not found");
  return inTransaction(pool, async (client) => {
    const { rowCount } = await client.query(
      `UPDATE setlists SET name = $3, category = $4, updated_at = now()
       WHERE id = $1 AND project_id = $2`,
      [setlistId, projectId, name, category],
    );
    if (!rowCount) throw new ServiceError("not_found", "Setlist not found");
    await client.query("DELETE FROM setlist_items WHERE setlist_id = $1", [setlistId]);
    await insertItems(client, projectId, setlistId, items);
    return getSetlist(client, setlistId);
  });
}

// Copies a Setlist, category and items, under `name`. The copy is its own
// Setlist from then on.
export async function duplicateSetlist(
  pool: Pool,
  user: User,
  projectId: string,
  setlistId: string,
  name: string,
): Promise<Setlist> {
  await requirePermission(pool, user, projectId, "editRepertoireSetlistsEvents");
  const newName = validName(name);
  if (!isUuid(setlistId)) throw new ServiceError("not_found", "Setlist not found");
  return inTransaction(pool, async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO setlists (project_id, name, category)
       SELECT project_id, $3, category FROM setlists WHERE id = $1 AND project_id = $2
       RETURNING id`,
      [setlistId, projectId, newName],
    );
    if (!rows[0]) throw new ServiceError("not_found", "Setlist not found");
    await client.query(
      `INSERT INTO setlist_items (project_id, setlist_id, position, song_id, selection_id)
       SELECT project_id, $2, position, song_id, selection_id FROM setlist_items
       WHERE setlist_id = $1`,
      [setlistId, rows[0].id],
    );
    return getSetlist(client, rows[0].id);
  });
}

// Deletes a template Setlist. Its Songs and Selections stay in the Repertoire.
export async function deleteSetlist(
  pool: Pool,
  user: User,
  projectId: string,
  setlistId: string,
): Promise<void> {
  await requirePermission(pool, user, projectId, "editRepertoireSetlistsEvents");
  if (!isUuid(setlistId)) throw new ServiceError("not_found", "Setlist not found");
  const { rowCount } = await pool.query("DELETE FROM setlists WHERE id = $1 AND project_id = $2", [
    setlistId,
    projectId,
  ]);
  if (!rowCount) throw new ServiceError("not_found", "Setlist not found");
}

async function insertItems(
  client: PoolClient,
  projectId: string,
  setlistId: string,
  items: SetlistItemRef[],
) {
  try {
    await client.query(
      `INSERT INTO setlist_items (project_id, setlist_id, position, song_id, selection_id)
       SELECT $1, $2, ord - 1,
         CASE WHEN kind = 'song' THEN id END, CASE WHEN kind = 'selection' THEN id END
       FROM unnest($3::text[], $4::uuid[]) WITH ORDINALITY AS t (kind, id, ord)`,
      [projectId, setlistId, items.map((i) => i.kind), items.map((i) => i.id)],
    );
  } catch (err) {
    // Not a Song or Selection of this Project: another Project's, or gone.
    if (
      isViolation(err, FOREIGN_KEY_VIOLATION, "setlist_items_song") ||
      isViolation(err, FOREIGN_KEY_VIOLATION, "setlist_items_selection")
    ) {
      throw new ServiceError(
        "invalid_input",
        "A Setlist can only contain this Project's Songs and Selections",
      );
    }
    throw err;
  }
}

async function getSetlist(client: PoolClient, setlistId: string): Promise<Setlist> {
  const { rows } = await client.query<Setlist>(
    `SELECT ${SETLIST_COLUMNS} FROM setlists sl WHERE sl.id = $1`,
    [setlistId],
  );
  return rows[0];
}

function validName(name: unknown): string {
  const trimmed = typeof name === "string" ? name.trim() : "";
  if (!trimmed) throw new ServiceError("invalid_input", "Setlist name is required");
  return trimmed;
}

function validSetlistInput(input: SetlistInput): Required<SetlistInput> {
  const name = validName(input.name);
  const category =
    typeof input.category === "string" && input.category.trim() ? input.category.trim() : null;
  const { items } = input;
  if (
    !Array.isArray(items) ||
    !items.every(
      (i) =>
        typeof i === "object" &&
        i !== null &&
        ITEM_KINDS.includes(i.kind) &&
        typeof i.id === "string" &&
        isUuid(i.id),
    )
  ) {
    throw new ServiceError("invalid_input", "A Setlist's items must be Songs or Selections");
  }
  return {
    name,
    category,
    items: items.map(({ kind, id }) => ({ kind, id: id.toLowerCase() })),
  };
}
