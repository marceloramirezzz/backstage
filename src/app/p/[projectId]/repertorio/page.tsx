import type { Metadata } from "next";
import { IntensityMeter } from "@/components/ui/intensity-meter.tsx";
import { getPool } from "@/db/pool.ts";
import { formatClock } from "@/lib/format.ts";
import { requireUser } from "@/lib/session.ts";
import { getPermissions } from "@/services/permissions.ts";
import { INTENSITIES, listSongs, type Song } from "@/services/songs.ts";
import { RepertoireFilters } from "./repertoire-filters.tsx";
import { NewSongButton, SongDialogs, SongMenu } from "./song-controls.tsx";

export const metadata: Metadata = { title: "Repertorio · Backstage" };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

// The Banda's Canciones. Every Member browses and searches them; Members who
// can edit the repertoire also add, edit and delete them.
export default async function RepertoirePage({
  params,
  searchParams,
}: PageProps<"/p/[projectId]/repertorio">) {
  const user = await requireUser();
  const { projectId } = await params;
  const query = await searchParams;
  const search = first(query.q) ?? "";
  const requested = first(query.intensidad);
  const intensity = INTENSITIES.find((i) => i === requested);
  const filtered = Boolean(search.trim() || intensity);

  // The layout has already turned a Project the User isn't in into a 404.
  const pool = getPool();
  const [permissions, all, matching] = await Promise.all([
    getPermissions(pool, user, projectId),
    listSongs(pool, user, projectId),
    filtered ? listSongs(pool, user, projectId, { search, intensity }) : null,
  ]);
  const songs = matching ?? all;
  const canEdit = permissions.editRepertoireSetlistsEvents;

  return (
    <main className="flex min-w-0 flex-col gap-6 p-6 max-desktop:px-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-display">Repertorio</h1>
          <p className="m-0 text-[14px]/[20px] text-ink-muted">
            {songCount(all.length)}. Los cambios llegan a cada Setlist, nunca a la de un Evento ya
            armado.
          </p>
        </div>
        {canEdit && (
          <div className="ml-auto flex flex-wrap items-center gap-3">
            <NewSongButton projectId={projectId} />
          </div>
        )}
      </div>
      {all.length > 0 && <RepertoireFilters search={search} intensity={intensity ?? ""} />}
      {songs.length > 0 ? (
        <SongList projectId={projectId} songs={songs} canEdit={canEdit} />
      ) : (
        <EmptyState filtered={filtered} canEdit={canEdit} />
      )}
    </main>
  );
}

const songCount = (n: number) => `${n} ${n === 1 ? "canción" : "canciones"}`;

const th = "px-4 py-2.5 text-left text-[12px]/[16px] font-medium whitespace-nowrap text-ink-muted";
const td = "border-t border-line px-4 py-3 align-middle text-[14px]/[20px]";

// A table from 640px up, stacked cards below.
function SongList({
  projectId,
  songs,
  canEdit,
}: {
  projectId: string;
  songs: Song[];
  canEdit: boolean;
}) {
  const list = (
    <div className="rounded-lg border border-line bg-bg-2">
      <table className="w-full border-collapse max-sm:hidden">
        <thead>
          <tr>
            <th className={th}>Título</th>
            <th className={th}>Tono</th>
            <th className={th}>Duración</th>
            <th className={th}>Intensidad</th>
            {canEdit && (
              <th className={th}>
                <span className="sr-only">Acciones</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {songs.map((song) => (
            <tr key={song.id}>
              <td className={`${td} font-medium`}>{song.name}</td>
              <td className={`${td} font-mono text-num`}>{song.key ?? "—"}</td>
              <td className={`${td} font-mono text-num`}>{formatClock(song.durationSeconds)}</td>
              <td className={td}>
                <IntensityMeter intensity={song.intensity} />
              </td>
              {canEdit && (
                <td className={`${td} text-right`}>
                  <SongMenu song={song} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="m-0 hidden list-none p-0 max-sm:block">
        {songs.map((song) => (
          <li key={song.id} className="flex items-start gap-3 border-line p-4 not-first:border-t">
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <span className="text-[14px]/[20px] font-medium">{song.name}</span>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <SongFact label="Tono">{song.key ?? "—"}</SongFact>
                <SongFact label="Duración">{formatClock(song.durationSeconds)}</SongFact>
                <IntensityMeter intensity={song.intensity} />
              </div>
            </div>
            {canEdit && <SongMenu song={song} />}
          </li>
        ))}
      </ul>
    </div>
  );
  return canEdit ? <SongDialogs projectId={projectId}>{list}</SongDialogs> : list;
}

function SongFact({ label, children }: { label: string; children: string }) {
  return (
    <span className="text-[13px]/[18px] text-ink-muted">
      {label} <span className="font-mono text-ink">{children}</span>
    </span>
  );
}

function EmptyState({ filtered, canEdit }: { filtered: boolean; canEdit: boolean }) {
  const [title, detail] = filtered
    ? ["Ninguna canción coincide", "Probá con otro título o con otra intensidad."]
    : [
        "Todavía no hay canciones",
        canEdit
          ? "Agregá las canciones que toca la banda para armar Enganchados y Setlists."
          : "Cuando alguien de la banda agregue canciones, las vas a ver acá.",
      ];
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border border-line bg-bg-2 px-6 py-12 text-center">
      <p className="m-0 text-heading">{title}</p>
      <p className="m-0 text-[14px]/[20px] text-ink-muted">{detail}</p>
    </div>
  );
}
