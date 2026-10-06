"use client";

import { Pencil, Plus, X } from "lucide-react";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import {
  addEventPayment,
  removeEventPayment,
  updateEventPayment,
} from "@/app/p/[projectId]/eventos/payment-actions.ts";
import { FormMessage } from "@/components/auth-screen.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Field, Input } from "@/components/ui/field.tsx";
import { MoneyInput } from "@/components/ui/money-input.tsx";
import { iconProps } from "@/components/ui/icon-props.ts";
import { formatLongDate } from "@/lib/calendar.ts";
import { formatGuaranies } from "@/lib/format.ts";
import type { Payment, PaymentSummary } from "@/services/payments.ts";

// Pagos recibidos from the client, with received versus balance. Only
// rendered for Roles that see totals; only those who also edit events record,
// edit or remove them (the services enforce both). The balance is
// informational: it never changes the Event's status.
export function PaymentsSection({
  projectId,
  eventId,
  summary,
  canEdit,
  today,
}: {
  projectId: string;
  eventId: string;
  summary: PaymentSummary;
  canEdit: boolean;
  today: string;
}) {
  const [error, setError] = useState<string>();
  const [editing, setEditing] = useState<string>();
  const [pending, startTransition] = useTransition();
  const { pay, payments, received, balance } = summary;

  return (
    <section
      aria-labelledby="pagos-title"
      className="flex flex-col gap-3 rounded-lg border border-line bg-bg-1 p-3"
    >
      <h2 id="pagos-title" className="m-0 text-[12px]/[16px] font-semibold uppercase tracking-wide text-ink-muted">
        Pagos recibidos
      </h2>
      {payments.length ? (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {payments.map((p) => (
            <li key={p.id} className="flex flex-col gap-2">
              <div className="flex items-center gap-2.5 text-[14px]/[20px]">
                <span className="min-w-0 grow">
                  <span className="block">{formatLongDate(p.date)}</span>
                  {p.note && <span className="block truncate text-[12px]/[16px] text-ink-muted">{p.note}</span>}
                </span>
                <span className="font-mono text-[13px]">{formatGuaranies(p.amount)}</span>
                {canEdit && (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="min-h-11 min-w-11 justify-center"
                      aria-label={`Editar el pago del ${formatLongDate(p.date)}`}
                      onClick={() => setEditing(editing === p.id ? undefined : p.id)}
                    >
                      <Pencil {...iconProps} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="min-h-11 min-w-11 justify-center"
                      aria-label={`Quitar el pago del ${formatLongDate(p.date)}`}
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () =>
                          setError((await removeEventPayment(projectId, eventId, p.id)).error),
                        )
                      }
                    >
                      <X {...iconProps} />
                    </Button>
                  </>
                )}
              </div>
              {editing === p.id && (
                <PaymentForm
                  projectId={projectId}
                  eventId={eventId}
                  payment={p}
                  today={today}
                  onDone={() => setEditing(undefined)}
                />
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 text-[14px]/[20px] text-ink-muted">Este evento todavía no tiene pagos recibidos.</p>
      )}
      {canEdit && <PaymentForm projectId={projectId} eventId={eventId} today={today} />}
      {error && <FormMessage tone="error">{error}</FormMessage>}
      <dl className="m-0 flex flex-col gap-2 border-t border-line pt-3 text-[14px]/[20px]">
        <Total label="Cachet" amount={pay} />
        <Total label="Recibido" amount={received} />
        <Total label={balance < 0 ? "Saldo a favor del cliente" : "Saldo"} amount={Math.abs(balance)} strong />
      </dl>
    </section>
  );
}

function Total({ label, amount, strong }: { label: string; amount: number; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 ${strong ? "font-semibold" : "text-ink-muted"}`}>
      <dt>{label}</dt>
      <dd className="m-0 font-mono">{formatGuaranies(amount)}</dd>
    </div>
  );
}

// Adds a Pago, or with `payment` edits that one.
function PaymentForm({
  projectId,
  eventId,
  payment,
  today,
  onDone,
}: {
  projectId: string;
  eventId: string;
  payment?: Payment;
  today: string;
  onDone?: () => void;
}) {
  const [state, action, pending] = useActionState(payment ? updateEventPayment : addEventPayment, { done: 0 });
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!state.done) return;
    ref.current?.reset();
    onDone?.();
  }, [state.done, onDone]);

  return (
    <form ref={ref} action={action} className="flex flex-col gap-2">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="eventId" value={eventId} />
      {payment && <input type="hidden" name="paymentId" value={payment.id} />}
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Fecha" className="w-40">
          <Input type="date" name="date" required defaultValue={payment?.date ?? today} />
        </Field>
        <Field label="Monto (Gs.)" className="w-36">
          <MoneyInput name="amount" required defaultValue={payment?.amount} />
        </Field>
        <Field label="Nota" className="min-w-40 grow">
          <Input name="note" autoComplete="off" defaultValue={payment?.note ?? ""} />
        </Field>
        <Button type="submit" variant="secondary" disabled={pending}>
          {payment ? "Guardar" : <><Plus {...iconProps} />Agregar pago</>}
        </Button>
      </div>
      {state.error && <FormMessage tone="error">{state.error}</FormMessage>}
    </form>
  );
}
