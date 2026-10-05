"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/auth-screen.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Field, Input, Select } from "@/components/ui/field.tsx";
import { EVENT_TYPES, EVENT_TYPE_LABELS, URGENCIES, URGENCY_LABELS } from "@/lib/booking.ts";
import { sendBookingRequest, type BookingFormState } from "./actions.ts";

const textarea =
  "w-full rounded-md border border-line-control bg-bg-2 p-3 text-[14px]/[20px] text-ink placeholder:text-ink-subtle";

// "Contratanos": the public Booking Request form. No budget is asked.
export function BookingForm({ slug, bandName }: { slug: string; bandName: string }) {
  const [state, action, pending] = useActionState<BookingFormState, FormData>(
    sendBookingRequest.bind(null, slug),
    {},
  );

  if (state.sent) {
    return (
      <p role="status" className="m-0 text-[18px]/[26px]">
        ¡Gracias! Recibimos tu solicitud y {bandName} te va a contactar a la brevedad.
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
        <Field label="Tu nombre">
          <Input name="clientName" size="lg" maxLength={200} required autoComplete="name" />
        </Field>
        <Field label="Tipo de evento">
          <Select name="eventType" required defaultValue="">
            <option value="" disabled>
              Elegí uno
            </option>
            {EVENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {EVENT_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Teléfono" hint="Dejanos un teléfono o un correo.">
          <Input name="phone" type="tel" size="lg" maxLength={40} autoComplete="tel" />
        </Field>
        <Field label="Correo">
          <Input name="email" type="email" size="lg" maxLength={200} autoComplete="email" />
        </Field>
        <Field label="Fecha del evento">
          <Input name="eventDate" type="date" size="lg" required />
        </Field>
        <Field label="Invitados (opcional)">
          <Input name="guests" type="number" inputMode="numeric" min={1} size="lg" />
        </Field>
        <Field label="Lugar (opcional)">
          <Input name="venue" size="lg" maxLength={200} />
        </Field>
        <Field label="Ubicación (opcional)">
          <Input name="location" size="lg" maxLength={200} />
        </Field>
        <Field label="Urgencia (opcional)">
          <Select name="urgency" defaultValue="">
            <option value="">Sin indicar</option>
            {URGENCIES.map((u) => (
              <option key={u} value={u}>
                {URGENCY_LABELS[u]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Estilo musical preferido (opcional)">
          <Input name="musicStyle" size="lg" maxLength={200} />
        </Field>
      </div>
      <Field label="Contanos sobre el evento">
        <textarea name="description" rows={5} maxLength={4000} required className={textarea} />
      </Field>
      {/* Honeypot: hidden from people, tempting to bots. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          No completar este campo
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      {state.error && <FormMessage tone="error">{state.error}</FormMessage>}
      <div>
        <Button type="submit" variant="primary" size="lg" disabled={pending}>
          Enviar solicitud
        </Button>
      </div>
    </form>
  );
}
