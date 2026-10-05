import { EVENT_TYPE_LABELS, URGENCY_LABELS, type BookingEventType, type BookingUrgency } from "../lib/booking.ts";
import type { EmailMessage, Mailer } from "./mailer.ts";

export interface BookingRequestDetails {
  clientName: string;
  phone: string | null;
  email: string | null;
  eventType: BookingEventType;
  // YYYY-MM-DD
  eventDate: string;
  description: string;
  venue: string | null;
  location: string | null;
  guests: number | null;
  urgency: BookingUrgency | null;
  musicStyle: string | null;
}

// Tells a Member who manages bookings about a new Solicitud, with everything
// the client wrote. The link signs them in and lands on the request.
export function newBookingRequestEmail(
  mailer: Mailer,
  to: string,
  projectName: string,
  projectId: string,
  requestId: string,
  request: BookingRequestDetails,
): EmailMessage {
  const link = new URL(`/p/${projectId}/solicitudes/${requestId}`, mailer.appUrl);
  const lines: [string, string | null][] = [
    ["Nombre", request.clientName],
    ["Teléfono", request.phone],
    ["Correo", request.email],
    ["Tipo de evento", EVENT_TYPE_LABELS[request.eventType]],
    ["Fecha", request.eventDate],
    ["Lugar", request.venue],
    ["Ubicación", request.location],
    ["Invitados", request.guests === null ? null : String(request.guests)],
    ["Urgencia", request.urgency ? URGENCY_LABELS[request.urgency] : null],
    ["Estilo musical", request.musicStyle],
  ];
  const details = lines
    .filter((l): l is [string, string] => l[1] !== null)
    .map(([label, value]) => `${label}: ${value}`)
    .join("\n");
  return {
    to,
    subject: `Nueva solicitud para ${projectName}: ${request.clientName}`,
    body: `Hola:

${request.clientName} pidió información para contratar a ${projectName}.

${details}

Descripción:
${request.description}

Para verla y responder, abrí este enlace (te pedirá ingresar si hace falta):

${link}
`,
  };
}

// Tells the client their Solicitud arrived. Sent only when they gave an email.
export function bookingConfirmationEmail(to: string, projectName: string, clientName: string): EmailMessage {
  return {
    to,
    subject: `Recibimos tu solicitud para ${projectName}`,
    body: `Hola ${clientName}:

Recibimos tu solicitud para ${projectName}. Te vamos a contactar a la brevedad.

Gracias por escribirnos.
`,
  };
}
