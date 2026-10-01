import type { Pool } from "pg";
import type { User } from "./accounts.ts";
import { FOREIGN_KEY_VIOLATION, ServiceError } from "./errors.ts";
import { isUuid } from "./ids.ts";
import { getPermissions, requirePermission } from "./permissions.ts";

export const INTENSITIES = ["calm", "medium", "danceable", "energetic"] as const;
export type Intensity = (typeof INTENSITIES)[number];

export interface Song {
  id: string;
  name: string;
  // Null while the band hasn't settled on one.
  key: string | null;
  durationSeconds: number;
  intensity: Intensity;
}

export type SongInput = Omit<Song, "id">;

// The longest a Song can run: 99:59.
export const MAX_SONG_DURATION_SECONDS = 99 * 60 + 59;

// Expects the songs table aliased as `s`.
const SONG_COLUMNS = `s.id, s.name, s.key, s.duration_seconds AS "durationSeconds", s.intensity`;

// Narrows a Repertoire listing: Songs or Selections.
export interface RepertoireFilter {
  // Any part of the name, ignoring case and accents.
  search?: string;
  intensity?: Intensity;
}

// The Project's Songs by name, optionally filtered. Any Member can browse them.
export async function listSongs(
  pool: Pool,
  user: User,
  projectId: string,
  filter: RepertoireFilter = {},
): Promise<Song[]> {
  await getPermissions(pool, user, projectId); // Members only
  const search = filter.search?.trim() || null;
  const { rows } = await pool.query<Song>(
    `SELECT ${SONG_COLUMNS} FROM songs s
     WHERE s.project_id = $1
       AND ($2::text IS NULL OR unaccent(s.name) ILIKE '%' || unaccent($2) || '%')
       AND ($3::song_intensity IS NULL OR s.intensity = $3)
     ORDER BY lower(unaccent(s.name)), s.id`,
    [projectId, search && escapeLike(search), filter.intensity ?? null],
  );
  return rows;
}

// Makes LIKE's wildcards match themselves.
export const escapeLike = (text: string) => text.replace(/[\\%_]/g, "\\$&");

export async function createSong(
  pool: Pool,
  user: User,
  projectId: string,
  input: SongInput,
): Promise<Song> {
  await requirePermission(pool, user, projectId, "editRepertoireSetlistsEvents");
  const { name, key, durationSeconds, intensity } = validSongInput(input);
  const { rows } = await pool.query<Song>(
    `INSERT INTO songs AS s (project_id, name, key, duration_seconds, intensity)
     VALUES ($1, $2, $3, $4, $5) RETURNING ${SONG_COLUMNS}`,
    [projectId, name, key, durationSeconds, intensity],
  );
  return rows[0];
}

// Replaces a Song's details. Selections and template Setlists reference the
// Song, so they show the change; Event Setlist snapshots keep their copies.
export async function updateSong(
  pool: Pool,
  user: User,
  projectId: string,
  songId: string,
  input: SongInput,
): Promise<Song> {
  await requirePermission(pool, user, projectId, "editRepertoireSetlistsEvents");
  const { name, key, durationSeconds, intensity } = validSongInput(input);
  if (!isUuid(songId)) throw new ServiceError("not_found", "Song not found");
  const { rows } = await pool.query<Song>(
    `UPDATE songs s SET name = $3, key = $4, duration_seconds = $5, intensity = $6,
       updated_at = now()
     WHERE s.id = $1 AND s.project_id = $2 RETURNING ${SONG_COLUMNS}`,
    [songId, projectId, name, key, durationSeconds, intensity],
  );
  if (!rows[0]) throw new ServiceError("not_found", "Song not found");
  return rows[0];
}

// Deletes a Song. A Song still in a Selection or Setlist can't be deleted
// until it's removed from them.
export async function deleteSong(
  pool: Pool,
  user: User,
  projectId: string,
  songId: string,
): Promise<void> {
  await requirePermission(pool, user, projectId, "editRepertoireSetlistsEvents");
  if (!isUuid(songId)) throw new ServiceError("not_found", "Song not found");
  let rowCount: number | null;
  try {
    ({ rowCount } = await pool.query("DELETE FROM songs WHERE id = $1 AND project_id = $2", [
      songId,
      projectId,
    ]));
  } catch (err) {
    // Only a Selection or Setlist referencing the Song can block deleting it.
    if ((err as { code?: string }).code === FOREIGN_KEY_VIOLATION) {
      throw new ServiceError("song_in_use", "Remove this Song from its Selections and Setlists first");
    }
    throw err;
  }
  if (!rowCount) throw new ServiceError("not_found", "Song not found");
}

function validSongInput(input: SongInput): SongInput {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) throw new ServiceError("invalid_input", "Song name is required");
  const key = typeof input.key === "string" && input.key.trim() ? input.key.trim() : null;
  const { durationSeconds, intensity } = input;
  if (
    !Number.isInteger(durationSeconds) ||
    durationSeconds <= 0 ||
    durationSeconds > MAX_SONG_DURATION_SECONDS
  ) {
    throw new ServiceError("invalid_input", "Song duration must be whole seconds, up to 99:59");
  }
  if (!INTENSITIES.includes(intensity)) {
    throw new ServiceError("invalid_input", "Song intensity must be calm, medium, danceable or energetic");
  }
  return { name, key, durationSeconds, intensity };
}
