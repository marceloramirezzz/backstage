import { AlertTriangle, Lock } from "lucide-react";
import type { ReactNode } from "react";
import { EventMemberRowForm } from "@/app/p/[projectId]/member-rules-editor.tsx";
import { iconProps } from "@/components/ui/icon-props.ts";
import { Tag } from "@/components/ui/tag.tsx";
import { formatGuaranies, formatShortDate } from "@/lib/format.ts";
import { roleLabel } from "@/lib/role-label.ts";
import { basisPointsToPercent } from "@/lib/split-form.ts";
import type { EventMemberRuleRow, EventPayout } from "@/services/splits.ts";

// Says the Reparto is a snapshot: a Pagado Evento keeps its amounts whatever
// happens to the band's Roles, Miembros or default Reparto afterwards.
function FrozenNotice({ frozenAt }: { frozenAt: string }) {
  return (
    <p className="m-0 flex items-start gap-2 rounded-md border border-line bg-bg-2 p-3 text-[13px]/[18px] text-ink-muted">
      <Lock {...iconProps} className="mt-px shrink-0" />
      <span>
        Reparto congelado el {formatShortDate(frozenAt)}: como el evento está pagado, los montos no cambian aunque
        cambien los roles, los miembros o el reparto de la banda. Si lo pasás a otro estado, vuelven a
        calcularse.
      </span>
    </p>
  );
}

const Tile = ({ label, amount }: { label: string; amount: number }) => (
  <div className="flex flex-col gap-1 rounded-md bg-bg-2 p-3">
    <span className="text-[12px]/[16px] text-ink-muted">{label}</span>
    <span className="font-mono text-[16px]/[22px] font-medium">{formatGuaranies(amount)}</span>
  </div>
);

const Line = ({ label, amount, strong, minus }: { label: ReactNode; amount: number; strong?: boolean; minus?: boolean }) => (
  <div className={`flex justify-between gap-4 ${strong ? "font-semibold" : "text-ink-muted"}`}>
    <dt className="min-w-0">{label}</dt>
    <dd className="m-0 font-mono">
      {minus && amount > 0 ? "− " : ""}
      {formatGuaranies(amount)}
    </dd>
  </div>
);

// The Evento's Reparto: a live preview, or frozen while the Evento is Pagado. Admins see the math and
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
  // Only for Admins: each Miembro's rule, override and Ajuste for this Evento.
  split?: EventMemberRuleRow[];
}) {
  if (payout.scope === "own") {
    return (
      <section aria-labelledby="reparto-title" className="flex flex-col gap-3 rounded-lg border border-line bg-bg-1 p-3">
        <h2 id="reparto-title" className="m-0 text-[12px]/[16px] font-semibold uppercase tracking-wide text-ink-muted">
          Reparto
        </h2>
        {payout.frozenAt && <FrozenNotice frozenAt={payout.frozenAt} />}
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
  // Snapshots frozen before per-Miembro rules are Role-based and have no `members`.
  const legacyRoles = payout.members ? [] : (payout.roles ?? []);
  const fixedRoles = legacyRoles.filter((r) => !r.skipped && r.kind !== "percentage");
  const percentRoles = legacyRoles.filter((r) => !r.skipped && r.kind === "percentage");
  const skipped = legacyRoles.filter((r) => r.skipped);
  const percentTotal = percentRoles.reduce((sum, r) => sum + r.value, 0);
  const members = payout.members ?? [];
  const fixedMembers = members.filter((m) => m.rule.kind === "fixed");
  const equalMembers = members.filter((m) => m.rule.kind === "equal");
  const adjusted = members.filter((m) => m.ajuste !== 0);
  const fixedTotal = result.fixedTotal;
  const peopleTotal =
    result.members.reduce((sum, m) => sum + m.amount, 0) + result.guests.reduce((sum, g) => sum + g.amount, 0);

  return (
    <section aria-labelledby="reparto-title" className="flex flex-col gap-3 rounded-lg border border-line bg-bg-1 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="reparto-title" className="m-0 flex items-center gap-2 text-[12px]/[16px] font-semibold uppercase tracking-wide text-ink-muted">
          Reparto
          {payout.frozenAt && <Tag>Congelado</Tag>}
        </h2>
        {payout.source && (
          <span className="text-[13px]/[18px] text-ink-muted">
            {payout.source === "event" ? "Reparto propio de este evento" : "Reparto de la banda"}
          </span>
        )}
      </div>

      {payout.frozenAt && <FrozenNotice frozenAt={payout.frozenAt} />}

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

      <div className="grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-3">
        <Tile label="Gastos" amount={payout.expensesTotal} />
        {result.fund > 0 && (
          <Tile label={`Fondo de la banda · ${basisPointsToPercent(payout.fundBasisPoints)} %`} amount={result.fund} />
        )}
        <Tile label="Montos fijos" amount={fixedTotal} />
        <Tile label={payout.members ? "A repartir en partes iguales" : "A repartir por porcentaje"} amount={result.remainder} />
      </div>

      <dl className="m-0 flex flex-col gap-2 text-[14px]/[20px]">
        <Line label="Cachet" amount={payout.pay} />
        <Line label="Gastos" amount={payout.expensesTotal} minus />
        <div className="border-t border-line pt-2">
          <Line label="Neto" amount={payout.net} strong />
        </div>
        {result.fund > 0 && (
          <Line
            minus
            label={`Fondo de la banda ${basisPointsToPercent(payout.fundBasisPoints)} %`}
            amount={result.fund}
          />
        )}
        {fixedMembers.map((m) => (
          <Line key={m.userId} minus label={`${m.displayName} (fijo)`} amount={m.rule.value} />
        ))}
        {adjusted.map((m) => (
          <Line key={`aj-${m.userId}`} minus label={`Ajuste · ${m.displayName}`} amount={m.ajuste} />
        ))}
        {fixedRoles.map((r) => (
          <Line
            key={r.roleId}
            minus
            label={`${roleLabel(r.roleKind, r.name)} · ${r.attendees.map((a) => a.displayName).join(", ")} (fijo)`}
            amount={r.amount}
          />
        ))}
        {payout.guests.map((g) => (
          <Line key={g.id} minus label={`Suplente · ${g.name} (fijo)`} amount={g.fixedAmount} />
        ))}
        <div className="border-t border-line pt-2">
          <Line label="A repartir" amount={result.remainder} strong />
        </div>
        {equalMembers.length > 0 && (
          <Line label={`Partes iguales · ${equalMembers.map((m) => m.displayName).join(", ")}`} amount={result.remainder} />
        )}
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
              <th className="py-2 pr-3 font-medium">{payout.members ? "Regla" : "Rol"}</th>
              <th className="py-2 text-right font-medium">Parte</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.userId} className="border-t border-line">
                <td className="py-2 pr-3">{m.displayName}</td>
                <td className="py-2 pr-3 text-ink-muted">
                  {m.rule.kind === "fixed" ? "Monto fijo" : "Parte igual"}
                  {m.ajuste !== 0 && ` · ajuste ${m.ajuste > 0 ? "+" : ""}${formatGuaranies(m.ajuste)}`}
                </td>
                <td className="py-2 text-right font-mono text-[13px]">{formatGuaranies(m.amount)}</td>
              </tr>
            ))}
            {legacyRoles.flatMap((r) =>
              r.attendees.map((a) => (
                <tr key={a.userId} className="border-t border-line">
                  <td className="py-2 pr-3">{a.displayName}</td>
                  <td className="py-2 pr-3 text-ink-muted">{roleLabel(r.roleKind, r.name)}</td>
                  <td className="py-2 text-right font-mono text-[13px]">
                    {formatGuaranies(a.amount)}
                  </td>
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

      {!result.overAllocated && (
        <p className="m-0 text-[13px]/[18px] text-ink-muted">
          Personas <span className="font-mono">{formatGuaranies(peopleTotal)}</span>
          {result.fund > 0 && (
            <>
              {" "}+ fondo <span className="font-mono">{formatGuaranies(result.fund)}</span>
            </>
          )}{" "}
          + gastos{" "}
          <span className="font-mono">{formatGuaranies(payout.expensesTotal)}</span>
          {result.unallocated > 0 && (
            <>
              {" "}+ sin repartir <span className="font-mono">{formatGuaranies(result.unallocated)}</span>
            </>
          )}{" "}
          = <span className="font-mono">{formatGuaranies(payout.pay)}</span>
        </p>
      )}

      {split && (
        <details className="border-t border-line pt-3">
          <summary className="cursor-pointer text-[14px]/[20px] font-medium">Reglas de este evento</summary>
          <div className="mt-3 flex flex-col">
            <p className="m-0 pb-3 text-[12px]/[16px] text-ink-muted">
              Cada miembro cobra una parte igual o un monto fijo; el ajuste se suma a su parte solo en este evento. Los
              montos fijos y ajustes salen primero del neto y el resto se divide en partes iguales.
            </p>
            {split.map((member) => (
              <EventMemberRowForm
                key={`${member.userId}-${JSON.stringify([member.override, member.ajuste])}`}
                projectId={projectId}
                eventId={eventId}
                member={member}
              />
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
