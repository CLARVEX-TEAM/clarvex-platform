"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * TiraSemana — los siete días en horizontal, para ver la FORMA de la semana.
 *
 * ⚠️ **Una semana es una forma, y una lista vertical la destruye.** La pantalla
 * enseñaba siete bloques apilados, así que para saber algo tan básico como
 * «trabajo de lunes a viernes y descanso el fin» había que leer los siete y
 * recordarlos. Puestos en fila, eso se ve sin leer: la fila de barras ES el
 * horario.
 *
 * ⚠️ **La tira dice solo si se trabaja o no, y el detalle dice qué es cada
 * día.** Pintar aquí los seis estados --descanso, vacaciones, pago de día,
 * conteo, baja-- devolvía el arcoíris que se acaba de quitar, y encima no hace
 * falta: la pregunta que se contesta de un vistazo es «¿qué días entro?». Cuál
 * es el motivo de un día libre se lee tocándolo.
 */

export type DiaDeSemana = {
  /** Nombre largo, «Lunes». */
  name: string;
  /** `YYYY-MM-DD`, y el identificador del día. */
  key: string;
  date: Date;
  /** Cuántas personas trabajan ese día (equipo), o 1/0 en la agenda propia. */
  trabajan: number;
  /** Total de registros del día, trabajen o no. */
  total: number;
};

export function TiraSemana({
  dias,
  hoy,
  elegido,
  onElegir,
  equipo = false,
  sobreDegradado = false,
  className
}: {
  dias: ReadonlyArray<DiaDeSemana>;
  hoy: string;
  elegido: string;
  onElegir: (key: string) => void;
  /** En la vista de equipo la barra se sustituye por cuántos entran. */
  equipo?: boolean;
  /**
   * La tira va encima del degradado azul de la cabecera, no sobre papel.
   *
   * ⚠️ Cambia los colores enteros, no solo el fondo: sobre el degradado el
   * texto va en blanco y el día elegido se levanta como una tarjeta blanca --el
   * único elemento claro de la franja--. Con los tonos de papel ahí, el número
   * en tinta sobre azul oscuro se pierde.
   */
  sobreDegradado?: boolean;
  className?: string;
}) {
  const alPulsarTecla = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const avance = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!avance) return;
    event.preventDefault();
    const actual = dias.findIndex((d) => d.key === elegido);
    const siguiente = dias[(actual + avance + dias.length) % dias.length];
    if (siguiente) onElegir(siguiente.key);
  };

  return (
    <div
      role="tablist"
      aria-label="Días de la semana"
      onKeyDown={alPulsarTecla}
      className={cn(
        "grid grid-cols-7 gap-1",
        sobreDegradado ? "px-1" : "papel-elev rounded-[20px] border border-line bg-card p-2",
        className
      )}
    >
      {dias.map((dia) => {
        const activo = dia.key === elegido;
        const esHoy = dia.key === hoy;
        const trabaja = dia.trabajan > 0;
        return (
          <button
            key={dia.key}
            type="button"
            role="tab"
            aria-selected={activo}
            aria-label={`${dia.name} ${dia.date.getUTCDate()}${esHoy ? ", hoy" : ""}${trabaja ? ", con turno" : ", sin turno"}`}
            tabIndex={activo ? 0 : -1}
            onClick={() => onElegir(dia.key)}
            className={cn(
              "flex min-h-[4.6rem] flex-col items-center justify-start gap-1 rounded-[16px] px-0.5 pt-2 pb-2",
              "transition-shadow focus:outline-hidden focus-visible:ring-4 focus-visible:ring-volt/30",
              sobreDegradado
                // El elegido SOBRESALE: tarjeta blanca con sombra propia, el
                // único elemento claro de la franja. Es lo que hace que se lea
                // como «este es el día que estoy mirando» sin ninguna etiqueta.
                ? activo
                  ? "bg-white shadow-[0_8px_20px_rgb(7_31_71/0.28)]"
                  : "hover:bg-white/10"
                : activo
                  ? "bg-volt/10"
                  : "hover:bg-panel"
            )}
          >
            {/* La inicial basta: con el número debajo no hay ambigüedad, y
                «Mié» no cabe en 49 px sin encogerlo hasta lo ilegible. */}
            <span className={cn(
              "text-[10px] font-semibold uppercase",
              sobreDegradado
                ? activo ? "text-[#1458BD]" : "text-white/70"
                : activo ? "text-volt" : "text-muted"
            )}>
              {dia.name.slice(0, 1)}
            </span>
            <span
              className={cn(
                "grid size-7 place-items-center rounded-full text-[15px] font-semibold tabular-nums",
                sobreDegradado
                  ? activo
                    ? "text-[#071F47]"
                    : esHoy ? "bg-white/25 text-white" : "text-white/80"
                  : esHoy ? "bg-ink text-card" : activo ? "text-volt" : "text-ink"
              )}
            >
              {dia.date.getUTCDate()}
            </span>

            {equipo ? (
              /* Cuántos entran: es la pregunta de gerencia al mirar la semana. */
              <span className={cn(
                "text-[11px] font-semibold tabular-nums",
                sobreDegradado
                  ? activo ? "text-[#1458BD]" : "text-white/75"
                  : trabaja ? "text-ink" : "text-muted"
              )}>
                {dia.total === 0 ? "–" : dia.trabajan}
              </span>
            ) : (
              /* La barra ES el horario: llena si se entra, apenas una línea si
                 no. Puesta en fila, las siete dibujan la semana. */
              <span
                aria-hidden
                className={cn(
                  "mt-0.5 block w-5 rounded-full",
                  sobreDegradado
                    ? trabaja
                      ? activo ? "h-1.5 bg-[#1458BD]" : "h-1.5 bg-white"
                      : dia.total === 0 ? "h-px bg-white/30" : "h-1.5 bg-white/30"
                    : trabaja ? "h-1.5 bg-volt" : dia.total === 0 ? "h-px bg-line" : "h-1.5 bg-line"
                )}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
