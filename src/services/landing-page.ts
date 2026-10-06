import type { Pool } from "pg";
import type { User } from "./accounts.ts";
import { ServiceError, UNIQUE_VIOLATION, isViolation } from "./errors.ts";
import { requirePermission } from "./permissions.ts";
import type { Intensity } from "./songs.ts";
import { CONTACT_PLATFORMS, isValidContactValue, type ContactPlatform } from "../lib/contact-link.ts";
import { LANDING_SERVICE_IDS, isLandingService } from "../lib/landing-services.ts";
import { RESERVED_SLUGS } from "../lib/reserved-slugs.ts";
import { parseVideoUrl, videoEmbedUrl } from "../lib/video-link.ts";
import { inTransaction } from "./transaction.ts";

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
      [projectId, slug, input.enabled],
    );
  } catch (err) {
    if (isViolation(err, UNIQUE_VIOLATION, "landing_pages_slug_unique")) {
      throw new ServiceError("slug_taken", "That address is already taken");
    }
    throw err;
  }
  return { enabled: input.enabled, slug };
}

export interface LandingPhoto {
  // An https address.
  url: string;
  caption: string | null;
}

export interface LandingContact {
  platform: ContactPlatform;
  // Only for "other": the free-text name of the channel.
  label: string | null;
  value: string;
}

export interface LandingMedia {
  // An https address.
  url: string;
  title: string | null;
}

export interface LandingContent {
  photos: LandingPhoto[];
  contacts: LandingContact[];
  audio: LandingMedia[];
  // YouTube or Vimeo addresses.
  videos: LandingMedia[];
}

export interface LandingProfile {
  tagline: string | null;
  genre: string | null;
  // Ids from the fixed list, in that list's order.
  services: string[];
  yearsActive: number | null;
  travelArea: string | null;
  about: string | null;
}

export const MAX_TAGLINE_LENGTH = 120;
export const MAX_GENRE_LENGTH = 60;
export const MAX_TRAVEL_AREA_LENGTH = 120;
export const MAX_ABOUT_LENGTH = 2000;
export const MAX_YEARS_ACTIVE = 100;
export const MAX_AUDIO = 10;
export const MAX_VIDEOS = 6;
export const MAX_TITLE_LENGTH = 140;

export const MAX_PHOTOS = 30;
export const MAX_CAPTION_LENGTH = 140;
export const MAX_URL_LENGTH = 2000;
export const MAX_CONTACTS = 12;
export const MAX_CONTACT_LABEL_LENGTH = 40;
export const MAX_CONTACT_VALUE_LENGTH = 200;

const PHOTOS_SQL = "SELECT url, caption FROM landing_photos WHERE project_id = $1 ORDER BY position";
const CONTACTS_SQL =
  "SELECT platform, label, value FROM landing_contacts WHERE project_id = $1 ORDER BY position";
const AUDIO_SQL = "SELECT url, title FROM landing_audio WHERE project_id = $1 ORDER BY position";
const VIDEOS_SQL = "SELECT url, title FROM landing_videos WHERE project_id = $1 ORDER BY position";
const PROFILE_SQL = `SELECT tagline, genre, services, years_active AS "yearsActive", travel_area AS "travelArea", about
  FROM landing_profiles WHERE project_id = $1`;
const EMPTY_PROFILE: LandingProfile = {
  tagline: null,
  genre: null,
  services: [],
  yearsActive: null,
  travelArea: null,
  about: null,
};

// The Admin's view of the album and contact links.
export async function getLandingContent(
  pool: Pool,
  user: User,
  projectId: string,
): Promise<LandingContent> {
  await requirePermission(pool, user, projectId, "administer");
  const [{ rows: photos }, { rows: contacts }, { rows: audio }, { rows: videos }] = await Promise.all([
    pool.query<LandingPhoto>(PHOTOS_SQL, [projectId]),
    pool.query<LandingContact>(CONTACTS_SQL, [projectId]),
    pool.query<LandingMedia>(AUDIO_SQL, [projectId]),
    pool.query<LandingMedia>(VIDEOS_SQL, [projectId]),
  ]);
  return { photos, contacts, audio, videos };
}

// The Admin's view of the hero, services and about text.
export async function getLandingProfile(
  pool: Pool,
  user: User,
  projectId: string,
): Promise<LandingProfile> {
  await requirePermission(pool, user, projectId, "administer");
  const { rows } = await pool.query<LandingProfile>(PROFILE_SQL, [projectId]);
  return rows[0] ?? EMPTY_PROFILE;
}

// A blank is "not set"; text over `max` is rejected.
function optionalText(value: string | null, max: number, what: string): string | null {
  const trimmed = (value ?? "").trim();
  if (trimmed.length > max) throw new ServiceError("invalid_input", `${what} is at most ${max} characters`);
  return trimmed || null;
}

// Replaces the hero, services and about text; a blank field clears it. Edits
// are live. Admins only. Services must come from the fixed list.
export async function saveLandingProfile(
  pool: Pool,
  user: User,
  projectId: string,
  input: LandingProfile,
): Promise<LandingProfile> {
  await requirePermission(pool, user, projectId, "administer");
  const unknown = input.services.find((id) => !isLandingService(id));
  if (unknown !== undefined) throw new ServiceError("invalid_input", "That service isn't on the list");
  const { yearsActive } = input;
  if (yearsActive !== null && (!Number.isInteger(yearsActive) || yearsActive < 0 || yearsActive > MAX_YEARS_ACTIVE)) {
    throw new ServiceError("invalid_input", `Years active is a whole number from 0 to ${MAX_YEARS_ACTIVE}`);
  }
  const clean: LandingProfile = {
    tagline: optionalText(input.tagline, MAX_TAGLINE_LENGTH, "A tagline"),
    genre: optionalText(input.genre, MAX_GENRE_LENGTH, "A genre"),
    services: LANDING_SERVICE_IDS.filter((id) => input.services.includes(id)),
    yearsActive,
    travelArea: optionalText(input.travelArea, MAX_TRAVEL_AREA_LENGTH, "A travel area"),
    about: optionalText(input.about, MAX_ABOUT_LENGTH, "The about text"),
  };
  await pool.query(
    `INSERT INTO landing_profiles (project_id, tagline, genre, services, years_active, travel_area, about)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (project_id) DO UPDATE
       SET tagline = $2, genre = $3, services = $4, years_active = $5, travel_area = $6, about = $7`,
    [projectId, clean.tagline, clean.genre, clean.services, clean.yearsActive, clean.travelArea, clean.about],
  );
  return clean;
}

function cleanMedia(
  items: LandingMedia[],
  max: number,
  what: string,
  validUrl: (url: string) => boolean,
): LandingMedia[] {
  if (items.length > max) throw new ServiceError("invalid_input", `At most ${max} ${what}`);
  return items.map((item) => {
    const url = item.url.trim();
    if (!url || url.length > MAX_URL_LENGTH || /\s/.test(url) || !validUrl(url)) {
      throw new ServiceError("invalid_input", `That isn't a valid address for ${what}`);
    }
    return { url, title: optionalText(item.title, MAX_TITLE_LENGTH, "A title") };
  });
}

async function replaceMedia(pool: Pool, table: "landing_audio" | "landing_videos", projectId: string, items: LandingMedia[]) {
  await inTransaction(pool, async (client) => {
    await client.query(`DELETE FROM ${table} WHERE project_id = $1`, [projectId]);
    for (const [position, { url, title }] of items.entries()) {
      await client.query(`INSERT INTO ${table} (project_id, position, url, title) VALUES ($1, $2, $3, $4)`, [
        projectId,
        position,
        url,
        title,
      ]);
    }
  });
}

// Replaces the audio sample links, in this order. Edits are live. Admins only.
export async function saveLandingAudio(
  pool: Pool,
  user: User,
  projectId: string,
  audio: LandingMedia[],
): Promise<LandingMedia[]> {
  await requirePermission(pool, user, projectId, "administer");
  const clean = cleanMedia(audio, MAX_AUDIO, "audio samples", isHttpsUrl);
  await replaceMedia(pool, "landing_audio", projectId, clean);
  return clean;
}

// Replaces the videos, in this order. Edits are live. Admins only. Only
// YouTube and Vimeo addresses are accepted.
export async function saveLandingVideos(
  pool: Pool,
  user: User,
  projectId: string,
  videos: LandingMedia[],
): Promise<LandingMedia[]> {
  await requirePermission(pool, user, projectId, "administer");
  const clean = cleanMedia(videos, MAX_VIDEOS, "videos", (url) => parseVideoUrl(url) !== null);
  await replaceMedia(pool, "landing_videos", projectId, clean);
  return clean;
}

const isHttpsUrl = (value: string) => {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
};

// Replaces the album with `photos`, in this order. Edits are live. Admins only.
export async function saveLandingAlbum(
  pool: Pool,
  user: User,
  projectId: string,
  photos: LandingPhoto[],
): Promise<LandingPhoto[]> {
  await requirePermission(pool, user, projectId, "administer");
  if (photos.length > MAX_PHOTOS) {
    throw new ServiceError("invalid_input", `An album holds at most ${MAX_PHOTOS} photos`);
  }
  const clean = photos.map((p) => {
    const url = p.url.trim();
    const caption = (p.caption ?? "").trim();
    if (!url || url.length > MAX_URL_LENGTH || /\s/.test(url) || !isHttpsUrl(url)) {
      throw new ServiceError("invalid_input", "A photo needs an https address");
    }
    if (caption.length > MAX_CAPTION_LENGTH) {
      throw new ServiceError("invalid_input", `A caption is at most ${MAX_CAPTION_LENGTH} characters`);
    }
    return { url, caption: caption || null };
  });
  await inTransaction(pool, async (client) => {
    await client.query("DELETE FROM landing_photos WHERE project_id = $1", [projectId]);
    for (const [position, { url, caption }] of clean.entries()) {
      await client.query(
        "INSERT INTO landing_photos (project_id, position, url, caption) VALUES ($1, $2, $3, $4)",
        [projectId, position, url, caption],
      );
    }
  });
  return clean;
}

// Replaces the contact links with `contacts`, in this order. Edits are live.
// Admins only. A label belongs to "other" alone.
export async function saveLandingContacts(
  pool: Pool,
  user: User,
  projectId: string,
  contacts: LandingContact[],
): Promise<LandingContact[]> {
  await requirePermission(pool, user, projectId, "administer");
  if (contacts.length > MAX_CONTACTS) {
    throw new ServiceError("invalid_input", `At most ${MAX_CONTACTS} contact links`);
  }
  const clean = contacts.map((c) => {
    if (!CONTACT_PLATFORMS.includes(c.platform)) {
      throw new ServiceError("invalid_input", "Unknown contact platform");
    }
    const value = c.value.trim();
    const label = c.platform === "other" ? (c.label ?? "").trim() : "";
    if (!value || value.length > MAX_CONTACT_VALUE_LENGTH || !isValidContactValue(c.platform, value)) {
      throw new ServiceError("invalid_input", "That contact isn't valid for its platform");
    }
    if (c.platform === "other" && (!label || label.length > MAX_CONTACT_LABEL_LENGTH)) {
      throw new ServiceError("invalid_input", `Other needs a label of up to ${MAX_CONTACT_LABEL_LENGTH} characters`);
    }
    return { platform: c.platform, label: label || null, value };
  });
  await inTransaction(pool, async (client) => {
    await client.query("DELETE FROM landing_contacts WHERE project_id = $1", [projectId]);
    for (const [position, { platform, label, value }] of clean.entries()) {
      await client.query(
        "INSERT INTO landing_contacts (project_id, position, platform, label, value) VALUES ($1, $2, $3, $4, $5)",
        [projectId, position, platform, label, value],
      );
    }
  });
  return clean;
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
  // The album, in order.
  photos: LandingPhoto[];
  // Contact links, in order.
  contacts: LandingContact[];
  profile: LandingProfile;
  audio: LandingMedia[];
  // Embeddable addresses, in order.
  videos: { embedUrl: string; title: string | null }[];
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
  const [
    { rows: repertoire },
    { rows: events },
    { rows: photos },
    { rows: contacts },
    { rows: profiles },
    { rows: audio },
    { rows: videos },
  ] = await Promise.all([
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
    pool.query<LandingPhoto>(PHOTOS_SQL, [page.projectId]),
    pool.query<LandingContact>(CONTACTS_SQL, [page.projectId]),
    pool.query<LandingProfile>(PROFILE_SQL, [page.projectId]),
    pool.query<LandingMedia>(AUDIO_SQL, [page.projectId]),
    pool.query<LandingMedia>(VIDEOS_SQL, [page.projectId]),
  ]);
  const appearances = events.map((e) => ({ ...e, upcoming: e.date >= today }));
  return {
    name: page.name,
    repertoire,
    appearances: [
      ...appearances.filter((a) => a.upcoming),
      ...appearances.filter((a) => !a.upcoming).reverse(),
    ],
    photos,
    contacts,
    profile: profiles[0] ?? EMPTY_PROFILE,
    audio,
    videos: videos.flatMap(({ url, title }) => {
      const ref = parseVideoUrl(url);
      return ref ? [{ embedUrl: videoEmbedUrl(ref), title }] : [];
    }),
  };
}
