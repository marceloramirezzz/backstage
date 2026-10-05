import type { Metadata } from "next";
import { IntensityMeter } from "@/components/ui/intensity-meter.tsx";
import { getPool } from "@/db/pool.ts";
import { formatClock } from "@/lib/format.ts";
import { requireUser } from "@/lib/session.ts";
import { getPermissions } from "@/services/permissions.ts";
import { listSelections, type Selection } from "@/services/selections.ts";
import { INTENSITIES, listSongs, type Song } from "@/services/songs.ts";
import { RepertoireFilters, type RepertoireType } from "./repertoire-filters.tsx";
import { NewSelectionButton, SelectionDialogs, SelectionMenu } from "./selection-controls.tsx";
import { NewSongButton, SongDialogs, SongMenu } from "./song-controls.tsx";

export const metadata: Metadata = { title: "Repertorio · Backstage" };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

// The Banda's Canciones and Enganchados. Every Member browses and searches
// them; Members who can edit the repertoire also add, edit and delete them.
export default async function RepertoirePage({
  params,
  searchParams,
}: PageProps<"/p/[projectId]/repertorio">) {
  const user = await requireUser();
  const { projectId } = await params;
  const query = await searchParams;
  const requestedType = first(query.tipo);
  const type: RepertoireType =
    requestedType === "canciones" || requestedType === "enganchados" ? requestedType : "";
  const search = first(query.q) ?? "";
  const requested = first(query.intensidad);
  const intensity = INTENSITIES.find((i) => i === requested);
  const filtered = Boolean(search.trim() || intensity);

  // The layout has already turned a Project the User isn't in into a 404.
  const pool = getPool();
  const filter = { search, intensity };
  const [permissions, allSongs, allSelections, songs, selections] = await Promise.all([
    getPermissions(pool, user, projectId),
    listSongs(pool, user, projectId),
    listSelections(pool, user, projectId),
    filtered ? listSongs(pool, user, projectId, filter) : null,
    filtered ? listSelections(pool, user, projectId, filter) : null,
  ]);
  const songRows = type === "enganchados" ? [] : (songs ?? allSongs);
  const selectionRows = type === "canciones" ? [] : (selections ?? allSelections);
  const canEdit = permissions.editRepertoireSetlistsEvents;
  const empty = allSongs.length + allSelections.length === 0;

  return (
    <main className="flex min-w-0 flex-col gap-6 p-6 max-desktop:px-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-display">Repertorio</h1>
          <p className="m-0 text-[14px]/[20px] text-ink-muted">
            {count(allSongs.length, "canción", "canciones")} ·{" "}
            {count(allSelections.length, "enganchado", "enganchados")}. Los cambios llegan a cada
            Setlist, nunca a la de un Evento ya armado.
          </p>
        </div>
        {canEdit && (
          <div className="ml-auto flex flex-wrap items-center gap-3">
            <NewSelectionButton projectId={projectId} songs={allSongs} />
            <NewSongButton projectId={projectId} />
          </div>
        )}
      </div>
      {!empty && <RepertoireFilters type={type} search={search} intensity={intensity ?? ""} />}
      {songRows.length + selectionRows.length > 0 ? (
        <RepertoireList
          projectId={projectId}
          songRows={songRows}
          selectionRows={selectionRows}
          songs={allSongs}
          usage={selectionsPerSong(allSelections)}
          canEdit={canEdit}
        />
      ) : (
        <EmptyState type={type} filtered={filtered && !empty} canEdit={canEdit} />
      )}
    </main>
  );
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

type Row = { kind: "song"; item: Song } | { kind: "selection"; item: Selection };

// How many Enganchados each Canción is in, by Song id.
function selectionsPerSong(selections: Selection[]): Map<string, number> {
  const usage = new Map<string, number>();
  for (const selection of selections) {
    for (const song of selection.songs) usage.set(song.id, (usage.get(song.id) ?? 0) + 1);
  }
  return usage;
}

function usedIn(row: Row, usage: Map<string, number>): string {
  const n = row.kind === "song" ? (usage.get(row.item.id) ?? 0) : 0;
  return n ? `En ${count(n, "enganchado", "enganchados")}` : "—";
}

// `La pollera colorá → Cariñito → Colegiala`
const songOrder = (selection: Selection) => selection.songs.map((s) => s.name).join(" → ");

const th = "px-4 py-2.5 text-left text-[12px]/[16px] font-medium whitespace-nowrap text-ink-muted";
const td = "border-t border-line px-4 py-3 align-middle text-[14px]/[20px]";

// Canciones and Enganchados each in their own section, titled when both show.
function RepertoireList({
  projectId,
  songRows,
  selectionRows,
  songs,
  usage,
  canEdit,
}: {
  projectId: string;
  songRows: Song[];
  selectionRows: Selection[];
  // Every Canción, for building Enganchados.
  songs: Song[];
  usage: Map<string, number>;
  canEdit: boolean;
}) {
  const both = songRows.length > 0 && selectionRows.length > 0;
  const list = (
    <div className="flex flex-col gap-6">
      {songRows.length > 0 && (
        <RowsSection
          title={both ? "Canciones" : undefined}
          rows={songRows.map((item): Row => ({ kind: "song", item }))}
          usage={usage}
          canEdit={canEdit}
        />
      )}
      {selectionRows.length > 0 && (
        <RowsSection
          title={both ? "Enganchados" : undefined}
          rows={selectionRows.map((item): Row => ({ kind: "selection", item }))}
          usage={usage}
          canEdit={canEdit}
        />
      )}
    </div>
  );
  if (!canEdit) return list;
  return (
    <SongDialogs projectId={projectId}>
      <SelectionDialogs projectId={projectId} songs={songs}>
        {list}
      </SelectionDialogs>
    </SongDialogs>
  );
}

// One kind of row (all Canciones or all Enganchados): a table from 640px up,
// stacked cards below.
function RowsSection({
  title,
  rows,
  usage,
  canEdit,
}: {
  title?: string;
  rows: Row[];
  usage: Map<string, number>;
  canEdit: boolean;
}) {
  const isSong = rows[0].kind === "song";
  const menu = (row: Row) =>
    row.kind === "song" ? <SongMenu song={row.item} /> : <SelectionMenu selection={row.item} />;
  return (
    <section className="flex flex-col gap-3">
      {title && <h2 className="m-0 text-heading">{title}</h2>}
      <div className="rounded-lg border border-line bg-bg-2">
        <table className="w-full border-collapse max-sm:hidden">
          <thead>
            <tr>
              <th className={th}>Título</th>
              {isSong && <th className={th}>Tono</th>}
              <th className={th}>Duración</th>
              <th className={th}>Intensidad</th>
              {isSong && <th className={th}>Usado en</th>}
              {canEdit && (
                <th className={th}>
                  <span className="sr-only">Acciones</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.item.id}>
                <td className={td}>
                  <span className="font-medium">{row.item.name}</span>
                  {row.kind === "selection" && (
                    <span className="block text-[12px]/[16px] text-ink-muted">
                      {songOrder(row.item)}
                    </span>
                  )}
                </td>
                {row.kind === "song" && (
                  <td className={`${td} font-mono text-num`}>{row.item.key ?? "—"}</td>
                )}
                <td className={`${td} font-mono text-num`}>
                  {formatClock(row.item.durationSeconds)}
                </td>
                <td className={td}>
                  <IntensityMeter intensity={row.item.intensity} />
                </td>
                {isSong && (
                  <td className={`${td} text-[13px]/[18px] whitespace-nowrap text-ink-muted`}>
                    {usedIn(row, usage)}
                  </td>
                )}
                {canEdit && <td className={`${td} text-right`}>{menu(row)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
        <ul className="m-0 hidden list-none p-0 max-sm:block">
          {rows.map((row) => {
            const used = usedIn(row, usage);
            return (
              <li
                key={row.item.id}
                className="flex items-start gap-3 border-line p-4 not-first:border-t"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <div className="flex flex-col">
                    <span className="text-[14px]/[20px] font-medium">{row.item.name}</span>
                    {row.kind === "selection" && (
                      <span className="text-[12px]/[16px] text-ink-muted">
                        {songOrder(row.item)}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    {row.kind === "song" && <Fact label="Tono">{row.item.key ?? "—"}</Fact>}
                    <Fact label="Duración">{formatClock(row.item.durationSeconds)}</Fact>
                    <IntensityMeter intensity={row.item.intensity} />
                    {used !== "—" && (
                      <span className="text-[13px]/[18px] text-ink-muted">{used}</span>
                    )}
                  </div>
                </div>
                {canEdit && menu(row)}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

function Fact({ label, children }: { label: string; children: string }) {
  return (
    <span className="text-[13px]/[18px] text-ink-muted">
      {label} <span className="font-mono text-ink">{children}</span>
    </span>
  );
}

function EmptyState({
  type,
  filtered,
  canEdit,
}: {
  type: RepertoireType;
  filtered: boolean;
  canEdit: boolean;
}) {
  const [title, detail] = filtered
    ? [
        type === "enganchados"
          ? "Ningún enganchado coincide"
          : type === "canciones"
            ? "Ninguna canción coincide"
            : "Nada coincide",
        "Probá con otro título o con otra intensidad.",
      ]
    : type === "enganchados"
      ? [
          "Todavía no hay enganchados",
          canEdit
            ? "Armá un enganchado con canciones del repertorio que se tocan de corrido."
            : "Cuando alguien de la banda arme enganchados, los vas a ver acá.",
        ]
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
