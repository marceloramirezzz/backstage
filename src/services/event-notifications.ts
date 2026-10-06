import type { Pool } from "pg";
import type { User } from "./accounts.ts";
import { eventNotificationEmail } from "../email/event-notification-email.ts";
import type { Mailer } from "../email/mailer.ts";
import { getAttendance } from "./attendance.ts";
import { getEvent, requireEdit } from "./events.ts";
import { getPermissions } from "./permissions.ts";

// Emails the date, time and location of the Event to the Members in its
// Attendance, and nobody else (Guests have no account). Returns how many were
// sent; one that fails is logged and skipped. Needs the edit-events permission.
export async function notifyAttendance(
  pool: Pool,
  mailer: Mailer,
  user: User,
  projectId: string,
  eventId: string,
): Promise<{ sent: number }> {
  requireEdit(await getPermissions(pool, user, projectId));
  const event = await getEvent(pool, user, projectId, eventId);
  const { members } = await getAttendance(pool, user, projectId, eventId);
  const attending = members.filter((m) => m.attending).map((m) => m.userId);
  const { rows } = await pool.query<{ email: string }>(
    `SELECT u.email FROM users u
     JOIN memberships m ON m.user_id = u.id AND m.project_id = $2
     WHERE u.id = ANY($1::uuid[]) ORDER BY u.email`,
    [attending, projectId],
  );
  const { rows: projects } = await pool.query<{ name: string }>("SELECT name FROM projects WHERE id = $1", [
    projectId,
  ]);
  let sent = 0;
  for (const { email } of rows) {
    try {
      await mailer.send(eventNotificationEmail(mailer, email, projects[0].name, projectId, eventId, event));
      sent++;
    } catch (err) {
      console.error(`Could not notify ${email} about an Event`, err);
    }
  }
  return { sent };
}
