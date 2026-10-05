import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { getPool } from "@/db/pool.ts";
import { requireUser } from "@/lib/session.ts";
import { ServiceError } from "@/services/errors.ts";
import { loadTeleprompter, type TeleprompterSource } from "@/services/lyrics.ts";
import { getPermissions } from "@/services/permissions.ts";
import { SOURCE_PARAMS } from "@/lib/teleprompter-href.ts";
import { Teleprompter } from "./teleprompter.tsx";

export const metadata: Metadata = { title: "Teleprompter · Backstage" };

// No pinch or double-tap zoom: a stray touch mustn't resize the lyrics on stage.
export const viewport: Viewport = { maximumScale: 1, userScalable: false };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

// The lyrics of a Canción, an Enganchado, a Setlist or an Event's Setlist,
// full screen, on its own page without the Banda's sidebar. It opens from
// where those are listed.
export default async function TeleprompterPage({
  params,
  searchParams,
}: PageProps<"/teleprompter/[projectId]">) {
  const user = await requireUser();
  const { projectId } = await params;
  const query = await searchParams;
  const kinds = Object.keys(SOURCE_PARAMS) as TeleprompterSource["kind"][];
  const kind = kinds.find((k) => first(query[SOURCE_PARAMS[k]]));
  if (!kind) notFound();
  const source = { kind, id: first(query[SOURCE_PARAMS[kind]]) ?? "" };

  const pool = getPool();
  // Outside the Banda's layout, so a Project the User isn't in is a 404 here.
  const [permissions, prompter] = await Promise.all([
    getPermissions(pool, user, projectId),
    loadTeleprompter(pool, user, projectId, source),
  ]).catch((err) => {
    if (err instanceof ServiceError && err.code === "not_found") notFound();
    throw err;
  });
  // Lyrics are edited where they're stored: a single Canción or Enganchado.
  const editable =
    permissions.editRepertoireSetlistsEvents && (kind === "song" || kind === "selection");

  return (
    <Teleprompter
      key={`${kind}-${source.id}`}
      projectId={projectId}
      title={prompter.title}
      items={prompter.items}
      editTarget={editable ? { kind, id: source.id } : null}
    />
  );
}
