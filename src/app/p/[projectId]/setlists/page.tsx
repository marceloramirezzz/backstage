import type { Metadata } from "next";
import Link from "next/link";
import { getPool } from "@/db/pool.ts";
import { requireUser } from "@/lib/session.ts";
import { getPermissions } from "@/services/permissions.ts";
import { listSelections } from "@/services/selections.ts";
import { listSetlists, type Setlist } from "@/services/setlists.ts";
import { listSongs } from "@/services/songs.ts";
import { NewSetlistButton, SetlistEditor, SetlistView } from "./setlist-editor.tsx";
import { SetlistPicker } from "./setlist-picker.tsx";
import { formatTotal } from "./total.ts";
import { UnsavedChangesProvider } from "./unsaved-changes.tsx";

export const metadata: Metadata = { title: "Setlists · Backstage" };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

// The Banda's template Setlists: a list with each one's category and total,
// and the chosen one beside it (under 900px, a picker above it instead).
// Every Member sees them; Members who can edit setlists also build, reorder,
// duplicate and delete them.
export default async function SetlistsPage({
  params,
  searchParams,
}: PageProps<"/p/[projectId]/setlists">) {
  const user = await requireUser();
  const { projectId } = await params;
  const requested = first((await searchParams).setlist);

  // The layout has already turned a Project the User isn't in into a 404.
  const pool = getPool();
  const [permissions, setlists] = await Promise.all([
    getPermissions(pool, user, projectId),
    listSetlists(pool, user, projectId),
  ]);
  const canEdit = permissions.editRepertoireSetlistsEvents;
  const [songs, selections] = canEdit
    ? await Promise.all([listSongs(pool, user, projectId), listSelections(pool, user, projectId)])
    : [[], []];
  const current = setlists.find((s) => s.id === requested) ?? setlists[0];

  return (
    <UnsavedChangesProvider>
      <main className="flex min-w-0 flex-col gap-6 p-6 max-desktop:px-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="m-0 text-display">Setlists</h1>
            <p className="m-0 text-[14px]/[20px] text-ink-muted">
              Plantillas. Un Evento copia una cuando la elegís, así los cambios nunca tocan shows
              pasados.
            </p>
          </div>
          {canEdit && (
            <div className="ml-auto flex flex-wrap items-center gap-3">
              <NewSetlistButton projectId={projectId} />
            </div>
          )}
        </div>
        {current ? (
          <div className="grid grid-cols-[300px_minmax(0,1fr)] items-start gap-6 max-desktop:grid-cols-[minmax(0,1fr)]">
            <div className="desktop:hidden">
              <SetlistPicker
                projectId={projectId}
                currentId={current.id}
                setlists={setlists.map(({ id, name, durationSeconds }) => ({
                  id,
                  label: `${name} · ${formatTotal(durationSeconds)}`,
                }))}
              />
            </div>
            <SetlistList projectId={projectId} setlists={setlists} currentId={current.id} />
            {canEdit ? (
              <SetlistEditor
                key={current.id}
                projectId={projectId}
                setlist={current}
                songs={songs}
                selections={selections}
              />
            ) : (
              <SetlistView setlist={current} />
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1 rounded-lg border border-line bg-bg-2 px-6 py-12 text-center">
            <p className="m-0 text-heading">Todavía no hay setlists</p>
            <p className="m-0 text-[14px]/[20px] text-ink-muted">
              {canEdit
                ? "Armá una setlist con canciones y enganchados del repertorio, en el orden del show."
                : "Cuando alguien de la banda arme setlists, las vas a ver acá."}
            </p>
          </div>
        )}
      </main>
    </UnsavedChangesProvider>
  );
}

const itemCount = (n: number) => `${n} ${n === 1 ? "ítem" : "ítems"}`;

function SetlistList({
  projectId,
  setlists,
  currentId,
}: {
  projectId: string;
  setlists: Setlist[];
  currentId: string;
}) {
  return (
    <nav aria-label="Setlists" className="max-desktop:hidden">
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {setlists.map((setlist) => {
          const current = setlist.id === currentId;
          return (
            <li key={setlist.id}>
              <Link
                href={`/p/${projectId}/setlists?setlist=${setlist.id}`}
                aria-current={current ? "page" : undefined}
                className={`flex flex-col gap-1 rounded-md p-3 text-ink no-underline outline-1 ${
                  current
                    ? "bg-spotlight-soft outline-spotlight"
                    : "bg-bg-2 outline-line hover:bg-bg-3"
                }`}
              >
                <span className="flex justify-between gap-2">
                  <span className="min-w-0 text-[14px]/[20px] font-medium">{setlist.name}</span>
                  <span className="shrink-0 font-mono text-[13px]/[20px] text-ink-muted">
                    {formatTotal(setlist.durationSeconds)}
                  </span>
                </span>
                <span className="text-[12px]/[16px] text-ink-muted">
                  {[setlist.category, itemCount(setlist.items.length)].filter(Boolean).join(" · ")}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
