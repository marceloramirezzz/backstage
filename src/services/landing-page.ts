import type { Pool } from "pg";
import type { User } from "./accounts.ts";
import { ServiceError, UNIQUE_VIOLATION, isViolation } from "./errors.ts";
import { requirePermission } from "./permissions.ts";
import type { Intensity } from "./songs.ts";
import { RESERVED_SLUGS } from "../lib/reserved-slugs.ts";

export interface LandingSettings {
  enabled: boolean;
  // Null until an Admin chooses one.
  slug: string | null;
}

export const MIN_SLUG_LENGTH = 3;
export const MAX_SLUG_LENGTH = 40;
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// The Admin's view of the Landing page's configuration.
export async function getLandingSettings(
  pool: Pool,
  user: User,
  projectId: string,
): Promise<LandingSettings> {
  await requirePermission(pool, user, projectId, "administer");
  const { rows } = await pool.query<LandingSettings>(
    "SELECT enabled, slug FROM landing_pages WHERE project_id = $1",
    [projectId],
  );
  return rows[0] ?? { enabled: false, slug: null };
}

// Turns the Landing page on or off and sets its address. Edits are live.
// Admins only. The address is trimmed and lowercased; it must be unique and
// not a path the app itself serves.
export async function saveLandingSettings(
  pool: Pool,
  user: User,
  projectId: string,
  input: LandingSettings,
): Promise<LandingSettings> {
  await requirePermission(pool, user, projectId, "administer");
  const slug = (input.slug ?? "").trim().toLowerCase();
  if (!slug) {
    if (input.enabled) throw new ServiceError("invalid_input", "Choose an address before turning the page on");
    // Nothing to publish at: switch off whatever was live, keep its address.
    const { rows } = await pool.query<LandingSettings>(
      "UPDATE landing_pages SET enabled = false, updated_at = now() WHERE project_id = $1 RETURNING enabled, slug",
      [projectId],
    );
    return rows[0] ?? { enabled: false, slug: null };
  }
  if (RESERVED_SLUGS.has(slug)) throw new ServiceError("slug_reserved", "That address is reserved");
  if (slug.length < MIN_SLUG_LENGTH || slug.length > MAX_SLUG_LENGTH || !SLUG_PATTERN.test(slug)) {
    throw new ServiceError(
      "invalid_input",
      `An address is ${MIN_SLUG_LENGTH}-${MAX_SLUG_LENGTH} lowercase letters, digits and single hyphens`,
    );
  }
  try {
    await pool.query(
      `INSERT INTO landing_pages (project_id, slug, enabled) VALUES ($1, $2, $3)
       ON CONFLICT (project_id) DO UPDATE SET slug = $2, enabled = $3, updated_at = now()`,
      [projectId, slug, Boolean(input.enabled)],
    );
  } catch (err) {
    if (isViolation(err, UNIQUE_VIOLATION, "landing_pages_slug_unique")) {
      throw new ServiceError("slug_taken", "That address is already taken");
    }
    throw err;
  }
  return { enabled: Boolean(input.enabled), slug };
}

export interface PublicAppearance {
  name: string;
  // YYYY-MM-DD
  date: string;
  startTime: string | null;
  location: string | null;
  // Today or later.
  upcoming: boolean;
}

export interface PublicLanding {
  name: string;
  // Titles and intensity only: never a key or a duration.
  repertoire: { name: string; intensity: Intensity }[];
  // Public Confirmed or Paid Events: upcoming soonest first, then played,
  // most recent first.
  appearances: PublicAppearance[];
}

// What anyone may see at an address, or null when nothing is published
// there. `today` is the band's current day, as YYYY-MM-DD.
export async function getPublicLanding(
  pool: Pool,
  slug: string,
  today: string,
): Promise<PublicLanding | null> {
  const { rows: pages } = await pool.query<{ projectId: string; name: string }>(
    `SELECT l.project_id AS "projectId", p.name FROM landing_pages l
     JOIN projects p ON p.id = l.project_id
     WHERE l.slug = $1 AND l.enabled`,
    [slug.trim().toLowerCase()],
  );
  const page = pages[0];
  if (!page) return null;
  const [{ rows: repertoire }, { rows: events }] = await Promise.all([
    pool.query<PublicLanding["repertoire"][number]>(
      `SELECT name, intensity FROM (
         SELECT name, intensity FROM songs WHERE project_id = $1
         UNION ALL
         SELECT name, intensity FROM selections WHERE project_id = $1
       ) r ORDER BY lower(unaccent(name)), name`,
      [page.projectId],
    ),
    pool.query<Omit<PublicAppearance, "upcoming">>(
      `SELECT name, to_char(date, 'YYYY-MM-DD') AS date, to_char(start_time, 'HH24:MI') AS "startTime", location
       FROM events
       WHERE project_id = $1 AND is_public AND status IN ('confirmed', 'paid')
       ORDER BY date, start_time NULLS LAST, lower(name), id`,
      [page.projectId],
    ),
  ]);
  const appearances = events.map((e) => ({ ...e, upcoming: e.date >= today }));
  return {
    name: page.name,
    repertoire,
    appearances: [
      ...appearances.filter((a) => a.upcoming),
      ...appearances.filter((a) => !a.upcoming).reverse(),
    ],
  };
}
