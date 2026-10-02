import {
  Calendar,
  ChartLine,
  DollarSign,
  Globe,
  ListMusic,
  LogOut,
  Music,
  Users,
} from "lucide-react";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { signOut } from "@/app/session-actions.ts";
import { AppShell } from "@/components/app-shell.tsx";
import { ProjectSwitcher } from "@/components/ui/project-switcher.tsx";
import { Avatar, BrandLockup } from "@/components/ui/brand.tsx";
import { IconButton } from "@/components/ui/button.tsx";
import { SettingsLink } from "@/components/ui/settings-link.tsx";
import { iconProps } from "@/components/ui/icon-props.ts";
import { NavGroup, Sidebar } from "@/components/ui/sidebar.tsx";
import { getPool } from "@/db/pool.ts";
import { initials } from "@/lib/initials.ts";
import { requireUser } from "@/lib/session.ts";
import { ServiceError } from "@/services/errors.ts";
import { listMyInvitations } from "@/services/invitations.ts";
import { getPermissions } from "@/services/permissions.ts";
import { getProject, listProjects } from "@/services/projects.ts";
import { HOME_SECTION, SECTIONS, type SectionPath } from "./sections.ts";

const ICONS: Record<SectionPath, ReactNode> = {
  calendario: <Calendar {...iconProps} />,
  resumen: <ChartLine {...iconProps} />,
  repertorio: <Music {...iconProps} />,
  setlists: <ListMusic {...iconProps} />,
  reparto: <DollarSign {...iconProps} />,
  miembros: <Users {...iconProps} />,
  "pagina-publica": <Globe {...iconProps} />,
};

export default async function ProjectLayout({ children, params }: LayoutProps<"/p/[projectId]">) {
  const user = await requireUser();
  const { projectId } = await params;
  const pool = getPool();
  const [project, projects, permissions, invitations] = await Promise.all([
    getProject(pool, user, projectId),
    listProjects(pool, user),
    getPermissions(pool, user, projectId),
    listMyInvitations(pool, user),
  ]).catch((err) => {
    if (err instanceof ServiceError && err.code === "not_found") notFound();
    throw err;
  });

  const base = `/p/${project.id}`;
  const items = SECTIONS.filter((s) => !s.adminOnly || permissions.administer).map((s) => ({
    href: `${base}/${s.path}`,
    label: s.label,
    icon: ICONS[s.path],
  }));

  const sidebar = (
    <Sidebar
      brand={<BrandLockup href={`${base}/${HOME_SECTION}`} />}
      footer={
        <div className="flex items-center gap-2.5 border-t border-line p-3 pr-0">
          <Avatar tone="neutral" initials={initials(user.displayName)} size="md" />
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-[14px]/[20px] font-medium">{user.displayName}</span>
            <span className="truncate text-[12px]/[16px] text-ink-muted">{user.email}</span>
          </div>
          <form action={signOut} className="ml-auto">
            <IconButton type="submit" aria-label="Cerrar sesión" title="Cerrar sesión" className="border-line">
              <LogOut {...iconProps} />
            </IconButton>
          </form>
        </div>
      }
    >
      <NavGroup label="Banda" items={items} />
    </Sidebar>
  );

  return (
    <AppShell
      sidebar={sidebar}
      topBarEnd={<SettingsLink />}
      topBar={
        <ProjectSwitcher
          current={{ id: project.id, name: project.name }}
          projects={projects.map(({ id, name }) => ({ id, name }))}
          invitationCount={invitations.length}
        />
      }
    >
      {children}
    </AppShell>
  );
}
