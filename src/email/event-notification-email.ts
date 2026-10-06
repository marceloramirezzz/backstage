import { formatLongDate } from "../lib/calendar.ts";
import { eventUid, inviteAttachment } from "../lib/ics.ts";
import type { EmailMessage, Mailer } from "./mailer.ts";

// "Sábado 1 de mayo de 2027": the year too, since an email outlives the week.
const longDateWithYear = (date: string) => `${formatLongDate(date)} de ${date.slice(0, 4)}`;

export interface NotifiedEvent {
  name: string;
  // YYYY-MM-DD
  date: string;
  // HH:MM, null while it isn't settled.
  startTime: string | null;
  durationMinutes: number;
  location: string | null;
}

// Tells a Member in an Event's Attendance when and where it is. The link goes
// to the Event, and an `.ics` invite for it rides along. The invite's UID is
// the feed's, so a calendar that has both shows the Event once.
export function eventNotificationEmail(
  mailer: Mailer,
  to: string,
  projectName: string,
  projectId: string,
  eventId: string,
  event: NotifiedEvent,
  now = new Date(),
): EmailMessage {
  const link = new URL(`/p/${projectId}/eventos/${eventId}`, mailer.appUrl);
  return {
    to,
    subject: `${event.name}: ${longDateWithYear(event.date)}`,
    body: `Hola:

Te avisamos del evento «${event.name}» de ${projectName}.

Fecha: ${longDateWithYear(event.date)}
Hora: ${event.startTime ?? "Sin definir"}
Lugar: ${event.location ?? "Sin definir"}

Para ver los detalles, abrí este enlace:

${link}
`,
    attachments: [
      inviteAttachment(
        "evento.ics",
        projectName,
        {
          uid: eventUid(eventId),
          summary: event.name,
          date: event.date,
          startTime: event.startTime,
          durationMinutes: event.durationMinutes,
          location: event.location,
        },
        now,
      ),
    ],
  };
}
