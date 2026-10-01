import { AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";
import { SplitEditor } from "@/app/p/[projectId]/split-editor.tsx";
import { iconProps } from "@/components/ui/icon-props.ts";
import { formatGuaranies } from "@/lib/format.ts";
import { roleLabel } from "@/lib/role-label.ts";
import { basisPointsToPercent } from "@/lib/split-form.ts";
import type { EventPayout, SplitRole, SplitRule } from "@/services/splits.ts";
import { UseDefaultSplitButton } from "./use-default-split.tsx";

const Line = ({ label, amount, strong, minus }: { label: ReactNode; amount: number; strong?: boolean; minus?: boolean }) => (
  <div className={`flex justify-between gap-4 ${strong ? "font-semibold" : "text-ink-muted"}`}>
    <dt className="min-w-0">{label}</dt>
    <dd className="m-0 font-mono">
      {minus && amount > 0 ? "− " : ""}
      {formatGuaranies(amount)}
    </dd>
  </div>
);

// The Evento's Reparto, live while it isn't frozen. Admins see the math and
// everyone's share and can give the Evento its own split; everyone else sees
// only their own share.
export function RepartoSection({
  projectId,
  eventId,
  payout,
  split,
}: {
  projectId: string;
  eventId: string;
  payout: EventPayout;
  // Only for Admins: the Evento's rules and the Roles to edit them for.
  split?: { rules: SplitRule[]; roles: SplitRole[] };
}) {
  if (payout.scope === "own") {
    return (
      <section aria-labelledby="reparto-title" className="flex flex-col gap-3 rounded-lg border border-line bg-bg-1 p-4">
        <h2 id="reparto-title" className="m-0 text-heading">
          Reparto
        </h2>
        {payout.amount === null ? (
          <p className="m-0 text-[14px]/[20px] text-ink-muted">No figurás en la asistencia de este evento: no te toca parte.</p>
        ) : (
          <p className="m-0 flex items-baseline justify-between gap-4 text-[14px]/[20px]">
            <span className="text-ink-muted">Tu parte</span>
            <span className="font-mono text-[15px] font-semibold">{formatGuaranies(payout.amount)}</span>
          </p>
        )}
      </section>
    );
  }

  const { result } = payout;
  const fixedRoles = payout.roles.filter((r) => !r.skipped && r.kind !== "percentage");
  const percentRoles = payout.roles.filter((r) => !r.skipped && r.kind === "percentage");
  const skipped = payout.roles.filter((r) => r.skipped);
  const percentTotal = percentRoles.reduce((sum, r) => sum + r.value, 0);
  const noRules = payout.rules.length === 0;

  return (
    <section aria-labelledby="reparto-title" className="flex flex-col gap-4 rounded-lg border border-line bg-bg-1 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="reparto-title" className="m-0 text-heading">
          Reparto
        </h2>
        <span className="text-[13px]/[18px] text-ink-muted">
          {payout.source === "event" ? "Reparto propio de este evento" : "Reparto de la banda"}
        </span>
      </div>

      {result.overAllocated && (
        <p
          role="alert"
          className="m-0 flex items-start gap-2 rounded-md border border-status-cancelled/35 bg-status-cancelled-bg p-3 text-[13px]/[18px] text-status-cancelled"
        >
          <AlertTriangle {...iconProps} className="mt-px shrink-0" />
          <span>
            Reparto excedido: {payout.net < 0 ? "los gastos superan el cachet" : "los montos fijos superan el neto"} por{" "}
            <span className="font-mono">{formatGuaranies(result.shortfall)}</span>. No se paga nada hasta corregirlo.
          </span>
        </p>
      )}

      {noRules && <p className="m-0 text-[14px]/[20px] text-ink-muted">Todavía no hay un reparto configurado: nadie cobra parte.</p>}

      <dl className="m-0 flex flex-col gap-2 text-[14px]/[20px]">
        <Line label="Cachet" amount={payout.pay} />
        <Line label="Gastos" amount={payout.expensesTotal} minus />
        <div className="border-t border-line pt-2">
          <Line label="Neto" amount={payout.net} strong />
        </div>
        {fixedRoles.map((r) => (
          <Line
            key={r.roleId}
            minus
            label={`${roleLabel(r.roleKind, r.name)} · ${r.attendees.map((a) => a.displayName).join(", ")} (fijo)`}
            amount={r.amount}
          />
        ))}
        {payout.guests.map((g) => (
          <Line key={g.id} minus label={`Suplente · ${g.name} (fijo)`} amount={result.overAllocated ? 0 : g.amount} />
        ))}
        <div className="border-t border-line pt-2">
          <Line label="A repartir" amount={result.remainder} strong />
        </div>
        {percentRoles.map((r) => (
          <Line
            key={r.roleId}
            label={`${roleLabel(r.roleKind, r.name)} ${basisPointsToPercent(
              percentTotal ? Math.round((r.value * 10_000) / percentTotal) : 0,
            )} % · ${r.attendees.map((a) => a.displayName).join(", ")}`}
            amount={r.amount}
          />
        ))}
      </dl>

      {skipped.length > 0 && (
        <p className="m-0 text-[12px]/[16px] text-ink-muted">
          Sin nadie que haya tocado, se saltea: {skipped.map((r) => roleLabel(r.roleKind, r.name)).join(", ")}.
        </p>
      )}
      {result.unallocated > 0 && (
        <p className="m-0 text-[12px]/[16px] text-ink-muted">
          Sin repartir: <span className="font-mono">{formatGuaranies(result.unallocated)}</span>.
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-[14px]/[20px]">
          <caption className="sr-only">Parte de cada persona</caption>
          <thead>
            <tr className="text-[12px]/[16px] font-medium text-ink-muted">
              <th className="py-2 pr-3 font-medium">Persona</th>
              <th className="py-2 pr-3 font-medium">Rol</th>
              <th className="py-2 text-right font-medium">Parte</th>
            </tr>
          </thead>
          <tbody>
            {payout.roles.flatMap((r) =>
              r.attendees.map((a) => (
                <tr key={a.userId} className="border-t border-line">
                  <td className="py-2 pr-3">{a.displayName}</td>
                  <td className="py-2 pr-3 text-ink-muted">{roleLabel(r.roleKind, r.name)}</td>
                  <td className="py-2 text-right font-mono text-[13px]">{formatGuaranies(a.amount)}</td>
                </tr>
              )),
            )}
            {payout.guests.map((g) => (
              <tr key={g.id} className="border-t border-line">
                <td className="py-2 pr-3">{g.name}</td>
                <td className="py-2 pr-3 text-ink-muted">Suplente</td>
                <td className="py-2 text-right font-mono text-[13px]">{formatGuaranies(g.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {split && (
        <details className="border-t border-line pt-3">
          <summary className="cursor-pointer text-[14px]/[20px] font-medium">Reparto de este evento</summary>
          <div className="mt-3">
            <SplitEditor
              key={JSON.stringify(split.rules)}
              projectId={projectId}
              eventId={eventId}
              roles={split.roles}
              rules={split.rules}
              submitLabel="Guardar para este evento"
            >
              {payout.source === "event" && <UseDefaultSplitButton projectId={projectId} eventId={eventId} />}
            </SplitEditor>
          </div>
        </details>
      )}
    </section>
  );
}
