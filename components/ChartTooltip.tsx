"use client";

import { cn } from "@/lib/utils";

/**
 * Tooltip compacto, común a todas las gráficas.
 *
 * El de serie de recharts pinta una caja a dos renglones —etiqueta arriba,
 * «Serie : valor» abajo— que en un teléfono tapa media curva justo donde se
 * está mirando. Aquí va todo en UN renglón: el dato en negrita y el contexto en
 * tinta apagada al lado. Se lee igual de rápido y ocupa un tercio.
 *
 * Recharts 3 dejó de exponer `payload` y `label` en `TooltipProps`, así que la
 * forma en tiempo de ejecución se declara a mano.
 */

export type ChartTooltipProps = {
  active?: boolean;
  payload?: Array<{ value?: number | string; name?: string; dataKey?: string }>;
  label?: string | number;
  isDark: boolean;
  /** Cómo formatear el valor. Por omisión se muestra tal cual. */
  format?: (value: number) => string;
  /** Texto de contexto. Por omisión, la etiqueta del eje. */
  caption?: (label: string) => string;
};

export function ChartTooltip({ active, payload, label, isDark, format, caption }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  const raw = payload[0]?.value;
  if (raw === undefined || raw === null) return null;

  const value = typeof raw === "number" ? (format ? format(raw) : String(raw)) : String(raw);
  const contextRaw = label === undefined || label === null ? "" : String(label);
  const context = caption ? caption(contextRaw) : contextRaw;

  return (
    <div
      className={cn(
        "pointer-events-none max-w-56 rounded-lg px-2.5 py-1.5 text-[12px] leading-none shadow-lg",
        isDark ? "bg-[#0f1729]/95 text-white ring-1 ring-white/12" : "bg-white/97 text-ink ring-1 ring-line"
      )}
    >
      <span className="font-semibold tabular-nums">{value}</span>
      {context ? (
        <span className={cn("ml-1.5 truncate", isDark ? "text-white/55" : "text-muted")}>{context}</span>
      ) : null}
    </div>
  );
}

/**
 * Cursor del tooltip para gráficas de BARRAS.
 *
 * Obligatorio pasarlo: sin él recharts pinta una franja gris muy clara del alto
 * de la barra que, sobre lienzo oscuro, se ve como un bloque blanco encima del
 * dato. Es el «cuadro» que aparecía al tocar.
 */
export function barCursor(isDark: boolean) {
  return { fill: isDark ? "rgba(255,255,255,0.05)" : "rgba(21,25,32,0.05)" };
}

/** Cursor para gráficas de líneas y áreas: una guía fina, no un bloque. */
export function lineCursor(isDark: boolean) {
  return { stroke: isDark ? "rgba(255,255,255,0.22)" : "rgba(15,23,42,0.18)", strokeWidth: 1 };
}

/**
 * Nombre corto para el eje de las gráficas de equipo.
 *
 * «WAIRA ZITLALI POPOCA» no cabe bajo una barra en un teléfono: se apiña con el
 * de al lado o se corta a la mitad. El nombre de pila basta para saber quién es
 * cuando son cinco personas, y la lista de abajo lleva el nombre completo.
 */
export function shortName(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? name;
  return first.length > 10 ? `${first.slice(0, 9)}…` : first;
}
