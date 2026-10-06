import type { Metadata } from "next";
import { getPool } from "@/db/pool.ts";
import { roleLabel } from "@/lib/role-label.ts";
import { requireUser } from "@/lib/session.ts";
import { listInvitations } from "@/services/invitations.ts";
import {
  getMyPublicProfile,
  MAX_PUBLIC_BIO_LENGTH,
  MAX_PUBLIC_NAME_LENGTH,
} from "@/services/landing-page.ts";
import { listMembers } from "@/services/members.ts";
import { getPermissions } from "@/services/permissions.ts";
import { getProject } from "@/services/projects.ts";
import { listRoles } from "@/services/roles.ts";
import { BandActions } from "./band-actions.tsx";
import { InvitationList, InviteButton } from "./invitations.tsx";
import { MembersList } from "./members-list.tsx";
import { PublicProfileForm } from "./public-profile-form.tsx";
import { RolesEditor } from "./roles.tsx";

export const metadata: Metadata = { title: "Miembros · Backstage" };

const DAY_MS = 24 * 60 * 60 * 1000;

const Card = ({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) => (
  <section className="flex min-w-0 flex-col gap-3 rounded-lg border border-line bg-bg-2 pt-4">
    <div className="flex items-center justify-between gap-3 px-4">
      <h2 className="m-0 text-heading">{title}</h2>
      {aside}
    </div>
    {children}
  </section>
);

// Everyone in the Banda with their Rol. Admins also invite, manage the open
// Invitaciones and edit Roles; each Member sees only what they can do, and the
// services enforce it regardless.
export default async function MembersPage({ params }: PageProps<"/p/[projectId]/miembros">) {
  const user = await requireUser();
  const { projectId } = await params;
  const pool = getPool();
  const [project, permissions, members, roles, publicProfile] = await Promise.all([
    getProject(pool, user, projectId),
    getPermissions(pool, user, projectId),
    listMembers(pool, user, projectId),
    listRoles(pool, user, projectId),
    getMyPublicProfile(pool, user, projectId),
  ]);
  const now = new Date();
  const invitations = permissions.administer ? await listInvitations(pool, user, projectId, now) : [];
  const roleKinds = new Map(roles.map((r) => [r.id, r]));
  const isOwner = project.ownerId === user.id;

  return (
    <main className="flex min-w-0 flex-col gap-6 p-6 max-desktop:px-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-display">Miembros</h1>
          <p className="m-0 text-[14px]/[20px] text-ink-muted">
            Todos en {project.name} y lo que puede hacer cada uno.
          </p>
        </div>
        {permissions.administer && (
          <div className="ml-auto">
            <InviteButton projectId={projectId} roles={roles} />
          </div>
        )}
      </div>
      <div
        className={`grid items-start gap-6 ${permissions.administer ? "grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] max-desktop:grid-cols-1" : ""}`}
      >
        <div className="flex min-w-0 flex-col gap-6">
          <Card title={`Miembros · ${members.length}`}>
            <MembersList
              projectId={projectId}
              roles={roles.map(({ id, kind, name }) => ({ id, kind, name }))}
              members={members.map((m) => ({
                ...m,
                isSelf: m.userId === user.id,
                canChangeRole: permissions.administer && !m.isOwner,
                canRemove:
                  permissions.removeMembers &&
                  !m.isOwner &&
                  m.userId !== user.id &&
                  (m.roleKind !== "admin" || permissions.administer),
              }))}
            />
          </Card>
          {permissions.administer && (
            <Card title="Invitaciones">
              <InvitationList
                projectId={projectId}
                invitations={invitations.map((i) => {
                  const role = i.roleId ? roleKinds.get(i.roleId) : undefined;
                  return {
                    id: i.id,
                    email: i.email,
                    roleLabel: role ? roleLabel(role.kind, role.name) : null,
                    expired: i.expired,
                    daysLeft: i.expired ? 0 : Math.ceil((i.expiresAt.getTime() - now.getTime()) / DAY_MS),
                  };
                })}
              />
            </Card>
          )}
          <Card title="Tu perfil público">
            <PublicProfileForm
              projectId={projectId}
              profile={publicProfile}
              limits={{ name: MAX_PUBLIC_NAME_LENGTH, bio: MAX_PUBLIC_BIO_LENGTH }}
            />
          </Card>
          <Card title="Tu lugar en la banda">
            <BandActions
              projectId={projectId}
              projectName={project.name}
              isOwner={isOwner}
              otherAdmins={members
                .filter((m) => m.roleKind === "admin" && m.userId !== user.id)
                .map(({ userId, displayName }) => ({ userId, displayName }))}
            />
          </Card>
        </div>
        {permissions.administer && (
          <Card title="Roles">
            <RolesEditor
              projectId={projectId}
              roles={roles.map((r) => ({
                id: r.id,
                kind: r.kind,
                name: r.name,
                toggles: r.toggles,
                holders: members.filter((m) => m.roleId === r.id).length,
              }))}
            />
          </Card>
        )}
      </div>
    </main>
  );
}
