"use server";

import { headers } from "next/headers";
import { getMailer } from "@/email/app-mailer.ts";
import { getPool } from "@/db/pool.ts";
import type { BookingEventType, BookingUrgency } from "@/lib/booking.ts";
import { text, whole } from "@/lib/form.ts";
import { ServiceError } from "@/services/errors.ts";
import { submitBookingRequest } from "@/services/booking-requests.ts";

export interface BookingFormState {
  error?: string;
  sent?: boolean;
}

// The visitor's address as the proxy in front of the app reports it.
async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || "unknown";
}

// The Booking Request form on a Landing page.
export async function sendBookingRequest(
  slug: string,
  _prev: BookingFormState,
  form: FormData,
): Promise<BookingFormState> {
  const type = text(form, "eventType");
  const urgency = text(form, "urgency");
  const guests = text(form, "guests");
  try {
    await submitBookingRequest(
      getPool(),
      getMailer(),
      slug,
      {
        clientName: text(form, "clientName"),
        phone: text(form, "phone"),
        email: text(form, "email"),
        eventType: type as BookingEventType,
        eventDate: text(form, "eventDate"),
        description: text(form, "description"),
        venue: text(form, "venue"),
        location: text(form, "location"),
        guests: guests.trim() === "" ? undefined : whole(guests),
        urgency: (urgency || undefined) as BookingUrgency | undefined,
        musicStyle: text(form, "musicStyle"),
        honeypot: text(form, "website"),
      },
      await clientIp(),
    );
    return { sent: true };
  } catch (err) {
    if (err instanceof ServiceError) {
      if (err.code === "not_found") return { error: "Esta página ya no recibe solicitudes." };
      if (err.code === "invalid_input" || err.code === "rate_limited") return { error: err.message };
    }
    throw err;
  }
}

