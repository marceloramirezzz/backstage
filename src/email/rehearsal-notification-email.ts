import { formatLongDate } from "../lib/calendar.ts";
import { inviteAttachment, rehearsalUid } from "../lib/ics.ts";
import type { EmailMessage, Mailer } from "./mailer.ts";

// "Sábado 1 de mayo de 2027": the year too, since an email outlives the week.
const longDateWithYear = (date: string) => `${formatLongDate(date)} de ${date.slice(0, 4)}`;

const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));

export interface NotifiedRehearsal {
  id: string;
  // YYYY-MM-DD
  date: string;
  // HH:MM
  startTime: string;
  endTime: string;
  location: string | null;
  notes: string | null;
}

// Tells a Member a Rehearsal was scheduled, with an `.ics` invite for it. The
// link goes to the Calendar.
export function rehearsalNotificationEmail(
  mailer: Mailer,
  to: string,
  projectName: string,
  projectId: string,
  rehearsal: NotifiedRehearsal,
  now = new Date(),
): EmailMessage {
  const link = new URL(`/p/${projectId}/calendario?mes=${rehearsal.date.slice(0, 7)}`, mailer.appUrl);
  return {
    to,
    subject: `Ensayo de ${projectName}: ${longDateWithYear(rehearsal.date)}`,
    body: `Hola:

Hay un ensayo nuevo de ${projectName}.

Fecha: ${longDateWithYear(rehearsal.date)}
Hora: ${rehearsal.startTime} – ${rehearsal.endTime}
Lugar: ${rehearsal.location ?? "Sin definir"}${rehearsal.notes ? `\nNotas: ${rehearsal.notes}` : ""}

Para verlo en el calendario, abrí este enlace:

${link}
`,
    attachments: [
      inviteAttachment(
        "ensayo.ics",
        projectName,
        {
          uid: rehearsalUid(rehearsal.id),
          summary: "Ensayo",
          date: rehearsal.date,
          startTime: rehearsal.startTime,
          durationMinutes: minutes(rehearsal.endTime) - minutes(rehearsal.startTime),
          location: rehearsal.location,
        },
        now,
      ),
    ],
  };
}
