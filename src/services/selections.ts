import type { Pool, PoolClient } from "pg";
import type { User } from "./accounts.ts";
import { FOREIGN_KEY_VIOLATION, isViolation, ServiceError } from "./errors.ts";
import { isUuid } from "./ids.ts";
import { getPermissions, requirePermission } from "./permissions.ts";
import {
  escapeLike,
  INTENSITIES,
  MAX_SONG_DURATION_SECONDS,
  type Intensity,
  type RepertoireFilter,
  type Song,
} from "./songs.ts";
import { inTransaction } from "./transaction.ts";

// A medley: Songs played back to back, with its own name, duration and
// intensity, and no key.
export interface Selection {
  id: string;
  name: string;
  durationSeconds: number;
  intensity: Intensity;
  // In playing order, as they are now: editing a Song shows here.
  songs: Song[];
}

export interface SelectionInput {
  name: string;
  durationSeconds: number;
  intensity: Intensity;
  songIds: string[];
}

// A medley is at least two Songs.
export const MIN_SELECTION_SONGS = 2;

// Expects the selections table aliased as `sel`.
export const SELECTION_COLUMNS = `sel.id, sel.name, sel.duration_seconds AS "durationSeconds",
  sel.intensity,
  (SELECT json_agg(json_build_object('id', s.id, 'name', s.name, 'key', s.key,
       'durationSeconds', s.duration_seconds, 'intensity', s.intensity) ORDER BY ss.position)
   FROM selection_songs ss JOIN songs s ON s.id = ss.song_id
   WHERE ss.selection_id = sel.id) AS songs`;

// The Project's Selections by name, optionally filtered like listSongs. Any
// Member can browse them.
export async function listSelections(
  pool: Pool,
  user: User,
  projectId: string,
  filter: RepertoireFilter = {},
): Promise<Selection[]> {
  await getPermissions(pool, user, projectId); // Members only
  const search = filter.search?.trim() || null;
  const { rows } = await pool.query<Selection>(
    `SELECT ${SELECTION_COLUMNS} FROM selections sel
     WHERE sel.project_id = $1
       AND ($2::text IS NULL OR unaccent(sel.name) ILIKE '%' || unaccent($2) || '%')
       AND ($3::song_intensity IS NULL OR sel.intensity = $3)
     ORDER BY lower(unaccent(sel.name)), sel.id`,
    [projectId, search && escapeLike(search), filter.intensity ?? null],
  );
  return rows;
}

export async function createSelection(
  pool: Pool,
  user: User,
  projectId: string,
  input: SelectionInput,
): Promise<Selection> {
  await requirePermission(pool, user, projectId, "editRepertoireSetlistsEvents");
  const { name, durationSeconds, intensity, songIds } = validSelectionInput(input);
  return inTransaction(pool, async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO selections (project_id, name, duration_seconds, intensity)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [projectId, name, durationSeconds, intensity],
    );
    await insertSongs(client, projectId, rows[0].id, songIds);
    return getSelection(client, rows[0].id);
  });
}

// Replaces a Selection's details and its Songs, all or none.
export async function updateSelection(
  pool: Pool,
  user: User,
  projectId: string,
  selectionId: string,
  input: SelectionInput,
): Promise<Selection> {
  await requirePermission(pool, user, projectId, "editRepertoireSetlistsEvents");
  const { name, durationSeconds, intensity, songIds } = validSelectionInput(input);
  if (!isUuid(selectionId)) throw new ServiceError("not_found", "Selection not found");
  return inTransaction(pool, async (client) => {
    const { rowCount } = await client.query(
      `UPDATE selections SET name = $3, duration_seconds = $4, intensity = $5, updated_at = now()
       WHERE id = $1 AND project_id = $2`,
      [selectionId, projectId, name, durationSeconds, intensity],
    );
    if (!rowCount) throw new ServiceError("not_found", "Selection not found");
    await client.query("DELETE FROM selection_songs WHERE selection_id = $1", [selectionId]);
    await insertSongs(client, projectId, selectionId, songIds);
    return getSelection(client, selectionId);
  });
}

// Deletes a Selection. Its Songs stay in the Repertoire. A Selection still in
// a Setlist can't be deleted until it's removed from it.
export async function deleteSelection(
  pool: Pool,
  user: User,
  projectId: string,
  selectionId: string,
): Promise<void> {
  await requirePermission(pool, user, projectId, "editRepertoireSetlistsEvents");
  if (!isUuid(selectionId)) throw new ServiceError("not_found", "Selection not found");
  let rowCount: number | null;
  try {
    ({ rowCount } = await pool.query("DELETE FROM selections WHERE id = $1 AND project_id = $2", [
      selectionId,
      projectId,
    ]));
  } catch (err) {
    if (isViolation(err, FOREIGN_KEY_VIOLATION, "setlist_items_selection")) {
      throw new ServiceError("selection_in_use", "Remove this Selection from its Setlists first");
    }
    throw err;
  }
  if (!rowCount) throw new ServiceError("not_found", "Selection not found");
}

async function insertSongs(
  client: PoolClient,
  projectId: string,
  selectionId: string,
  songIds: string[],
) {
  try {
    await client.query(
      `INSERT INTO selection_songs (project_id, selection_id, position, song_id)
       SELECT $1, $2, ord - 1, song_id FROM unnest($3::uuid[]) WITH ORDINALITY AS t (song_id, ord)`,
      [projectId, selectionId, songIds],
    );
  } catch (err) {
    // Not a Song of this Project: another Project's, a Selection, or gone.
    if (isViolation(err, FOREIGN_KEY_VIOLATION, "selection_songs_song")) {
      throw new ServiceError("invalid_input", "A Selection can only contain this Project's Songs");
    }
    throw err;
  }
}

async function getSelection(client: PoolClient, selectionId: string): Promise<Selection> {
  const { rows } = await client.query<Selection>(
    `SELECT ${SELECTION_COLUMNS} FROM selections sel WHERE sel.id = $1`,
    [selectionId],
  );
  return rows[0];
}

function validSelectionInput(input: SelectionInput): SelectionInput {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) throw new ServiceError("invalid_input", "Selection name is required");
  const { durationSeconds, intensity, songIds } = input;
  if (
    !Number.isInteger(durationSeconds) ||
    durationSeconds <= 0 ||
    durationSeconds > MAX_SONG_DURATION_SECONDS
  ) {
    throw new ServiceError("invalid_input", "Selection duration must be whole seconds, up to 99:59");
  }
  if (!INTENSITIES.includes(intensity)) {
    throw new ServiceError(
      "invalid_input",
      "Selection intensity must be calm, medium, danceable or energetic",
    );
  }
  if (
    !Array.isArray(songIds) ||
    songIds.length < MIN_SELECTION_SONGS ||
    !songIds.every((id) => typeof id === "string" && isUuid(id))
  ) {
    throw new ServiceError("invalid_input", "A Selection needs at least two Songs");
  }
  const ids = songIds.map((id) => id.toLowerCase());
  if (new Set(ids).size !== ids.length) {
    throw new ServiceError("invalid_input", "A Song can play only once in a Selection");
  }
  return { name, durationSeconds, intensity, songIds: ids };
}
