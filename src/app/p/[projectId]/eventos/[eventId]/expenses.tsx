"use client";

import { Plus, X } from "lucide-react";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import {
  addEventExpense,
  removeEventExpense,
} from "@/app/p/[projectId]/eventos/expense-actions.ts";
import { FormMessage } from "@/components/auth-screen.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Field, Input } from "@/components/ui/field.tsx";
import { iconProps } from "@/components/ui/icon-props.ts";
import { formatGuaranies } from "@/lib/format.ts";
import type { ExpenseSummary } from "@/services/expenses.ts";

// Cachet, Gastos and the net pay. Only rendered for Roles that see totals;
// only those who also edit events add or remove Gastos (the services enforce
// both). Editing the Cachet itself lives in the event's edit dialog.
export function ExpensesSection({
  projectId,
  eventId,
  summary,
  canEdit,
}: {
  projectId: string;
  eventId: string;
  summary: ExpenseSummary;
  canEdit: boolean;
}) {
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const { pay, expenses, total, netPay } = summary;

  return (
    <section
      aria-labelledby="gastos-title"
      className="flex flex-col gap-4 rounded-lg border border-line bg-bg-1 p-4"
    >
      <h2 id="gastos-title" className="m-0 text-heading">
        Cachet y gastos
      </h2>
      {expenses.length ? (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {expenses.map((e) => (
            <li key={e.id} className="flex items-center gap-2.5 text-[14px]/[20px]">
              <span className="min-w-0 grow truncate">{e.name}</span>
              <span className="font-mono text-[13px]">{formatGuaranies(e.amount)}</span>
              {canEdit && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="min-h-11 min-w-11 justify-center"
                  aria-label={`Quitar el gasto ${e.name}`}
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () =>
                      setError((await removeEventExpense(projectId, eventId, e.id)).error),
                    )
                  }
                >
                  <X {...iconProps} />
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 text-[14px]/[20px] text-ink-muted">Este evento todavía no tiene gastos.</p>
      )}
      {canEdit && <ExpenseForm projectId={projectId} eventId={eventId} />}
      {error && <FormMessage tone="error">{error}</FormMessage>}
      <dl className="m-0 flex flex-col gap-2 border-t border-line pt-3 text-[14px]/[20px]">
        <Total label="Cachet" amount={pay} />
        <Total label="Gastos" amount={total} />
        <Total label="Neto" amount={netPay} strong />
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

function ExpenseForm({ projectId, eventId }: { projectId: string; eventId: string }) {
  const [state, action, pending] = useActionState(addEventExpense, { done: 0 });
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.done) ref.current?.reset();
  }, [state.done]);

  return (
    <form ref={ref} action={action} className="flex flex-col gap-2">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="eventId" value={eventId} />
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Gasto" className="min-w-40 grow">
          <Input name="name" required autoComplete="off" />
        </Field>
        <Field label="Monto (Gs.)" className="w-36">
          <Input name="amount" type="number" inputMode="numeric" min={0} step={1} required />
        </Field>
        <Button type="submit" variant="secondary" disabled={pending}>
          <Plus {...iconProps} />
          Agregar gasto
        </Button>
      </div>
      {state.error && <FormMessage tone="error">{state.error}</FormMessage>}
    </form>
  );
}
