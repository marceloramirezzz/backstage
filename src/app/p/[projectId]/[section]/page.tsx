import { notFound } from "next/navigation";
import { SECTIONS } from "../sections.ts";

// Stands in for each section until its own route is built; a static route
// such as calendario/page.tsx takes precedence over this one.
export default async function SectionPlaceholder({
  params,
}: PageProps<"/p/[projectId]/[section]">) {
  const { section } = await params;
  const match = SECTIONS.find((s) => s.path === section);
  if (!match) notFound();

  return (
    <main className="flex min-w-0 flex-col gap-6 p-6 max-desktop:px-4">
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-display">{match.label}</h1>
        <p className="m-0 text-[14px]/[20px] text-ink-muted">Esta sección todavía no está lista.</p>
      </div>
    </main>
  );
}
