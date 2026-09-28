"use client";

import { Mail } from "lucide-react";
import {
  formatRate, rateStatus, reportedRate, sumTickets,
  type RateStatus, type ReportedTickets
} from "@/lib/electronic-tickets";
import type { KpiReportItem } from "@/lib/kpi-report";

/**
 * Ticket electrónico en la pantalla de KPIs.
 *
 * Estructura pedida por el usuario, calcada de cómo ya se presenta la venta:
 * gerencia ve SU número individual y el de TIENDA, más la tabla del equipo.
 * El asesor ve solo el suyo.
 *
 * Dos metas, no una: gerencia se mide contra la de tienda y el asesor contra la
 * de asesor, que es la misma para todos. Igual que el mínimo de comisión.
 *
 * Componente compartido: lo montan `/kpis` y `/escritorio/kpis`. Uno solo, para
 * que un arreglo aplique a las dos a la vez.
 */

const STATUS_STYLE: Record<RateStatus, string> = {
  cumple: "text-mint",
  cerca: "text-ember",
  abajo: "text-orchid",
  "sin-meta": "text-ink",
  "sin-dato": "text-muted"
};

function StatusValue({ rate, target }: { rate: number | null; target: number | null }) {
  return (
    <span className={`font-semibold tabular-nums ${STATUS_STYLE[rateStatus(rate, target)]}`}>
      {formatRate(rate)}
    </span>
  );
}

/** Barra de avance contra la meta. Se recorta a 100 para no desbordar la caja. */
function Track({ rate, target }: { rate: number | null; target: number | null }) {
  const status = rateStatus(rate, target);
  if (rate === null) return <div className="h-1.5 rounded-full bg-line/60" />;
  const width = Math.min(100, Math.max(2, rate));
  const fill =
    status === "cumple" ? "bg-mint" : status === "cerca" ? "bg-ember" : status === "abajo" ? "bg-orchid" : "bg-volt";
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-line/60">
      <div className={`h-full rounded-full ${fill}`} style={{ width: `${width}%` }} />
    </div>
  );
}

function Headline({ label, row, target, hint }: { label: string; row: ReportedTickets | null; target: number | null; hint?: string }) {
  const rate = reportedRate(row);
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${STATUS_STYLE[rateStatus(rate, target)]}`}>{formatRate(rate)}</p>
      <p className="mt-0.5 text-[11px] tabular-nums text-muted">
        {row?.crmTransactions !== null && row?.crmTransactions !== undefined
          ? `${row.crmTransactions} de ${row.posTransactions ?? 0} tickets`
          : hint ?? "Sin capturar"}
        {target !== null && target > 0 ? ` · meta ${target}%` : ""}
      </p>
      <div className="mt-2"><Track rate={rate} target={target} /></div>
    </div>
  );
}

export function ElectronicTicketsPanel({
  own,
  store,
  team,
  isAdvisor,
  storeTarget,
  advisorTarget
}: {
  own: KpiReportItem | null;
  store: KpiReportItem | null;
  team: KpiReportItem[];
  isAdvisor: boolean;
  storeTarget: number | null;
  advisorTarget: number | null;
}) {
  // El equipo son los asesores, no la tienda: la tienda incluye a gerencia y su
  // meta es otra. Se suman aparte para poder compararlos contra la meta correcta.
  const advisors = team.filter((member) => member.role === "ASESOR");
  const teamTotals = sumTickets(advisors);

  const hasAnything =
    own?.crmTransactions !== null ||
    store?.crmTransactions !== null ||
    advisors.some((member) => member.crmTransactions !== null);

  return (
    <section className="rounded-2xl border border-line bg-panel p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-volt/12 text-volt">
          <Mail size={17} />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-ink">Ticket electrónico</h2>
          <p className="mt-0.5 text-xs text-muted">
            {isAdvisor
              ? "Porcentaje de tus tickets que salieron con ticket electrónico."
              : "Tu porcentaje, el de la tienda y el de cada asesor."}
          </p>
        </div>
      </div>

      {!hasAnything ? (
        <p className="mt-4 rounded-xl bg-void px-3 py-3 text-xs text-muted">
          Todavía no hay capturas de este periodo.
          {!isAdvisor ? " Se capturan por semana desde Captura Clarvex." : ""}
        </p>
      ) : (
        <>
          {/* Cifras de cabecera. Gerencia ve la suya Y la de tienda, como ya
              ocurre con la venta. El asesor solo la suya. */}
          <div className={`mt-4 grid gap-4 ${isAdvisor ? "" : "sm:grid-cols-3"}`}>
            <Headline
              label={isAdvisor ? "Mi porcentaje" : "Yo"}
              row={own}
              target={isAdvisor ? advisorTarget : storeTarget}
            />
            {!isAdvisor ? (
              <>
                <Headline label="Tienda" row={store} target={storeTarget} />
                <Headline label="Equipo (asesores)" row={teamTotals} target={advisorTarget} />
              </>
            ) : null}
          </div>

          {/* Tabla por asesor, como la de alcance. Solo gerencia. */}
          {!isAdvisor && advisors.length > 0 ? (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[24rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-line">
                    <th className="pb-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted">Asesor</th>
                    <th className="pb-2 text-right text-[11px] font-semibold uppercase tracking-wide text-muted">Electrónicos</th>
                    <th className="pb-2 text-right text-[11px] font-semibold uppercase tracking-wide text-muted">Tickets</th>
                    <th className="pb-2 text-right text-[11px] font-semibold uppercase tracking-wide text-muted">Tasa</th>
                  </tr>
                </thead>
                <tbody>
                  {advisors.map((member) => {
                    const rate = reportedRate(member);
                    return (
                      <tr key={member.userId} className="border-b border-line/60 last:border-b-0">
                        <td className="py-2.5 pr-3">
                          <span className="block font-semibold text-ink">{member.userName}</span>
                          <div className="mt-1 w-24"><Track rate={rate} target={advisorTarget} /></div>
                        </td>
                        <td className="py-2.5 text-right tabular-nums text-muted">{member.crmTransactions ?? "—"}</td>
                        <td className="py-2.5 text-right tabular-nums text-muted">{member.posTransactions ?? "—"}</td>
                        <td className="py-2.5 pl-3 text-right"><StatusValue rate={rate} target={advisorTarget} /></td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-line">
                    <td className="pt-2.5 font-semibold text-ink">Equipo</td>
                    <td className="pt-2.5 text-right tabular-nums text-muted">{teamTotals.crmTransactions ?? "—"}</td>
                    <td className="pt-2.5 text-right tabular-nums text-muted">{teamTotals.posTransactions ?? "—"}</td>
                    <td className="pt-2.5 pl-3 text-right"><StatusValue rate={reportedRate(teamTotals)} target={advisorTarget} /></td>
                  </tr>
                  <tr>
                    <td className="pt-2 font-semibold text-ink">Tienda</td>
                    <td className="pt-2 text-right tabular-nums text-muted">{store?.crmTransactions ?? "—"}</td>
                    <td className="pt-2 text-right tabular-nums text-muted">{store?.posTransactions ?? "—"}</td>
                    <td className="pt-2 pl-3 text-right"><StatusValue rate={reportedRate(store)} target={storeTarget} /></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
