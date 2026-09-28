"use client";

import { ArrowDownToLine, ArrowUpFromLine, Boxes, PackagePlus } from "lucide-react";
import { Sparkline } from "@/components/desktop/DeskCharts";
import { KardexMovimientos } from "@/components/desktop/KardexMovimientos";
import { DesktopError } from "@/components/desktop/DesktopError";
import {
  DeskEmpty,
  DeskPanel,
  DeskReveal,
  DeskSection,
  DeskSkeleton,
  deskTd,
  deskTdMuted,
  deskTh,
  deskThRight,
  deskThead,
  deskTr
} from "@/components/desktop/DeskUI";
import {
  pieces,
  shortDay,
  signedPieces,
  useKardex,
  type KardexDay
} from "@/components/desktop/useKardex";
import { useTheme } from "@/components/ThemeProvider";
import { cn } from "@/lib/utils";

/**
 * Kardex de inventario, solo lectura.
 *
 * La captura vive en Retool; aquí se ve. Por eso no hay ni un botón que escriba:
 * dos sitios donde capturar lo mismo es cómo se acaba con dos verdades.
 */
export default function EscritorioKardexPage() {
  const { isDark } = useTheme();
  const { data, error, loading, reload } = useKardex();

  if (error) return <DesktopError onRetry={() => void reload()} />;

  if (loading && !data) {
    return (
      <div className="space-y-4">
        <DeskSkeleton className="h-32 w-full" />
        <DeskSkeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!data?.round || !data.summary) {
    return (
      <DeskEmpty
        icon={PackagePlus}
        title="Sin ronda de inventario abierta"
        hint="El kardex arranca con un inventario físico. Se abre desde la pantalla de captura; en cuanto exista una ronda, aquí aparece la existencia día a día."
      />
    );
  }

  const { round, summary, daily, change, difference, movements } = data;
  const serie = daily.map((day) => day.theoretical);
  const ultimos = daily.slice(-14);

  return (
    <div className="space-y-8">
      <DeskReveal index={0}>
        <DeskPanel>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-caption text-muted">
                <Boxes size={13} aria-hidden />
                {round.name} · desde el {shortDay(round.startDate)}
                {round.endDate ? ` · cerrada el ${shortDay(round.endDate)}` : ""}
              </p>
              <p className="mt-1 text-caption text-muted">Existencia teórica de hoy</p>
              <p className="mt-0.5 text-3xl font-semibold tabular-nums text-ink">{pieces(summary.theoretical)}</p>
              {change !== null ? (
                <p className={cn("mt-1 text-caption tabular-nums", change < 0 ? "text-danger" : change > 0 ? "text-success" : "text-muted")}>
                  {signedPieces(change)} respecto a ayer
                </p>
              ) : null}
            </div>
            {serie.length > 1 ? (
              <div className="w-40 shrink-0 sm:w-56">
                <Sparkline values={serie} isDark={isDark} />
              </div>
            ) : null}
          </div>

          {difference !== null ? (
            <div className={cn("mt-4 rounded-xl border px-4 py-3", difference < 0 ? "border-danger/40" : "border-success/40")}>
              <p className="text-caption text-muted">Diferencia del conteo de cierre contra el teórico</p>
              <p className={cn("text-xl font-semibold tabular-nums", difference < 0 ? "text-danger" : "text-success")}>
                {signedPieces(difference)}
              </p>
            </div>
          ) : null}
        </DeskPanel>
      </DeskReveal>

      <DeskReveal index={1}>
        <DeskSection title="De dónde sale ese número" hint="Base de la ronda más entradas, menos salidas. Las ventas vienen de los KPIs; no se capturan en el kardex.">
          <div className="grid gap-3 sm:grid-cols-2">
            <DeskPanel>
              <p className="flex items-center gap-1.5 text-ui font-medium text-ink">
                <ArrowDownToLine size={14} className="text-success" aria-hidden />
                Entradas
              </p>
              <dl className="mt-3 space-y-2">
                <Linea label="Recepción de mercancía" value={summary.received} />
                <Linea label="Traspasos de entrada" value={summary.transferredIn} />
                <Linea label="Devoluciones de cliente" value={summary.customerReturns} />
              </dl>
            </DeskPanel>
            <DeskPanel>
              <p className="flex items-center gap-1.5 text-ui font-medium text-ink">
                <ArrowUpFromLine size={14} className="text-danger" aria-hidden />
                Salidas
              </p>
              <dl className="mt-3 space-y-2">
                <Linea label="Ventas (de KPIs)" value={summary.sold} />
                <Linea label="Traspasos de salida" value={summary.transferredOut} />
                <Linea label="Ship From Store" value={summary.shipFromStore} />
              </dl>
            </DeskPanel>
          </div>
          <p className="mt-3 text-caption text-muted">
            Base de la ronda: <span className="tabular-nums text-ink">{pieces(round.basePieces)}</span>
            {summary.adjustments !== 0 ? (
              <> · Ajustes: <span className="tabular-nums text-ink">{signedPieces(summary.adjustments)}</span></>
            ) : null}
          </p>
        </DeskSection>
      </DeskReveal>

      <DeskReveal index={2}>
        <DeskSection title="Día a día" hint="Existencia al cierre de cada día. Los días sin movimiento también aparecen: un hueco se leería como si el inventario hubiera dejado de existir.">
          <div className="overflow-x-auto">
            <table className="w-full min-w-136">
              <thead className={deskThead}>
                <tr>
                  <th className={deskTh}>Día</th>
                  <th className={deskThRight}>Entradas</th>
                  <th className={deskThRight}>Ventas</th>
                  <th className={deskThRight}>Salidas</th>
                  <th className={deskThRight}>Existencia</th>
                </tr>
              </thead>
              <tbody>
                {ultimos.map((day) => (
                  <Fila key={day.date} day={day} />
                ))}
              </tbody>
            </table>
          </div>
        </DeskSection>
      </DeskReveal>

      <DeskReveal index={3}>
        <DeskSection
          title="Movimientos de la ronda"
          hint="Filtra por tipo y marca las filas que quieras sumar, como en el Excel. Con Shift se marca un tramo entero."
        >
          <KardexMovimientos movements={movements} truncated={data.movementsTruncated === true} />
        </DeskSection>
      </DeskReveal>
    </div>
  );
}

function Linea({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-ui text-muted">{label}</dt>
      <dd className="text-ui tabular-nums text-ink">{pieces(value)}</dd>
    </div>
  );
}

function Fila({ day }: { day: KardexDay }) {
  const quieto = day.incoming === 0 && day.outgoing === 0 && day.sold === 0 && day.adjustments === 0;
  return (
    <tr className={deskTr}>
      <td className={quieto ? deskTdMuted : deskTd}>{shortDay(day.date)}</td>
      <td className={cn(deskTdMuted, "text-right tabular-nums")}>{day.incoming === 0 ? "—" : `+${pieces(day.incoming)}`}</td>
      <td className={cn(deskTdMuted, "text-right tabular-nums")}>{day.sold === 0 ? "—" : `−${pieces(day.sold)}`}</td>
      <td className={cn(deskTdMuted, "text-right tabular-nums")}>{day.outgoing === 0 ? "—" : `−${pieces(day.outgoing)}`}</td>
      <td className={cn(deskTd, "text-right font-medium tabular-nums")}>{pieces(day.theoretical)}</td>
    </tr>
  );
}
