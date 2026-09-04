"use client";

import { Clock3, Palmtree, CalendarCheck2 } from "lucide-react";
import type { User } from "@/lib/types";
import { ProfileAvatar } from "@/components/ui";
import { DeskEmpty, deskTd, deskTh, deskThead, deskTr } from "@/components/desktop/DeskUI";

/**
 * Saldos del equipo: horas, días pagados y vacaciones, en una sola tabla.
 *
 * Los tres números son el saldo **de hoy**, no el que gerencia capturó: cada uno
 * es `base + ganado − tomado`. El capturado es solo el punto de partida y se
 * desfasa en cuanto alguien toma un día — mostrarlo aquí sería enseñar un
 * número que casi nunca es el bueno.
 *
 * ⚠️ **Es de solo lectura a propósito.** La tabla de abajo, en esta misma
 * pantalla, es donde se editan las BASES. Poder teclear encima del saldo
 * calculado invitaría a «corregirlo» escribiendo el total, que es justo lo que
 * rompe la cuenta: ese número volvería a servir de base y lo ganado se contaría
 * otra vez.
 */

/** Minutos a un texto legible con signo. −90 → «−1h 30m». */
export function horasLegibles(minutos: number): string {
  const signo = minutos < 0 ? "−" : "";
  const abs = Math.abs(minutos);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h === 0) return `${signo}${m}m`;
  if (m === 0) return `${signo}${h}h`;
  return `${signo}${h}h ${m}m`;
}

/** Un saldo negativo se debe; uno positivo se tiene. Se distingue en color. */
function tono(valor: number): string {
  if (valor > 0) return "text-emerald-600 dark:text-emerald-400";
  if (valor < 0) return "text-rose-600 dark:text-rose-400";
  return "text-muted";
}

function Celda({
  principal,
  detalle,
  valor
}: {
  principal: string;
  detalle: string;
  valor: number;
}) {
  return (
    <td className={deskTd}>
      <span className={`font-semibold tabular-nums ${tono(valor)}`}>{principal}</span>
      {/* El desglose va debajo y en pequeño: sin él, un saldo que no cuadra con
          lo que la persona recuerda no se puede discutir con nada en la mano. */}
      <span className="block text-caption text-muted tabular-nums">{detalle}</span>
    </td>
  );
}

export function SaldosEquipo({ gente }: { gente: User[] }) {
  // Solo quien tiene saldos visibles. Un asesor mirando su propia pantalla ve
  // los suyos; gerencia los ve todos. Lo decide el servidor, no esto.
  const filas = gente.filter((p) => p.hoursBalanceMinutes !== undefined || p.paidAvailable !== undefined);

  if (filas.length === 0) {
    return (
      <DeskEmpty
        icon={Clock3}
        title="Sin saldos que mostrar"
        hint="Aparecen en cuanto gerencia captura el saldo inicial de cada persona en la tabla de abajo."
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px]">
        <caption className="sr-only">
          Saldo de horas, días pagados y vacaciones de cada colaborador
        </caption>
        <thead className={deskThead}>
          <tr>
            <th scope="col" className={`${deskTh} w-64 pl-3`}>Colaborador</th>
            <th scope="col" className={deskTh}>
              <span className="inline-flex items-center gap-1.5"><Clock3 size={13} /> Banco de horas</span>
            </th>
            <th scope="col" className={deskTh}>
              <span className="inline-flex items-center gap-1.5"><CalendarCheck2 size={13} /> Días pagados</span>
            </th>
            <th scope="col" className={deskTh}>
              <span className="inline-flex items-center gap-1.5"><Palmtree size={13} /> Vacaciones</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {filas.map((p) => {
            const minutos = p.hoursBalanceMinutes ?? 0;
            const pagados = p.paidAvailable ?? 0;
            const vacaciones = p.vacationDays ?? 0;

            return (
              <tr key={p.id} className={deskTr}>
                <td className={`${deskTd} pl-3`}>
                  <span className="flex items-center gap-2.5">
                    <ProfileAvatar name={p.name} photoUrl={p.photoUrl} size="sm" />
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-ink">{p.name}</span>
                      <span className="block text-caption text-muted">{p.role}</span>
                    </span>
                  </span>
                </td>

                <Celda
                  valor={minutos}
                  principal={horasLegibles(minutos)}
                  detalle={`base ${horasLegibles(p.hoursAdjustmentMinutes ?? 0)} · ganadas ${horasLegibles(p.hoursEarnedMinutes ?? 0)} · usadas ${horasLegibles(p.hoursSpentMinutes ?? 0)}`}
                />

                <Celda
                  valor={pagados}
                  principal={`${pagados} ${pagados === 1 ? "día" : "días"}`}
                  detalle={
                    `base ${p.paidBaseline ?? 0} · ganados ${p.paidEarned ?? 0} · tomados ${p.paidTaken ?? 0}` +
                    // Lo planificado NO se ha descontado todavía. Callarlo hace
                    // que el saldo parezca mayor de lo que va a ser el lunes.
                    ((p.paidPlanned ?? 0) > 0 ? ` · ${p.paidPlanned} por venir` : "")
                  }
                />

                <Celda
                  valor={vacaciones}
                  principal={`${vacaciones} ${vacaciones === 1 ? "día" : "días"}`}
                  detalle={
                    `base ${p.vacationBaseline ?? 0} · ganados ${p.vacationEarned ?? 0} · tomados ${p.vacationTaken ?? 0}` +
                    ((p.vacationPlanned ?? 0) > 0 ? ` · ${p.vacationPlanned} por venir` : "")
                  }
                />
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
