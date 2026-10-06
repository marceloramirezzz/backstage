import { formatLongDate } from "../lib/calendar.ts";
import type { EmailMessage, Mailer } from "./mailer.ts";

// "Sábado 1 de mayo de 2027": the year too, since an email outlives the week.
const longDateWithYear = (date: string) => `${formatLongDate(date)} de ${date.slice(0, 4)}`;

export interface NotifiedEvent {
  name: string;
  // YYYY-MM-DD
  date: string;
  // HH:MM, null while it isn't settled.
  startTime: string | null;
  location: string | null;
}

// Tells a Member in an Event's Attendance when and where it is. The link goes
// to the Event.
export function eventNotificationEmail(
  mailer: Mailer,
  to: string,
  projectName: string,
  projectId: string,
  eventId: string,
  event: NotifiedEvent,
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
  };
}
