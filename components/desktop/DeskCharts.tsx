"use client";

import { useReducedMotion } from "framer-motion";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TrendPoint } from "@/lib/trend";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Colores de las series, validados con el comprobador de paletas del skill de
 * visualización (no elegidos a ojo).
 *
 * La meta se hundió en luminosidad a propósito. Con el gris anterior, venta
 * (L 0.703) y meta (L 0.672) quedaban casi a la misma luminosidad: ΔE 13.1 en
 * visión normal, por debajo del piso de 15 — se confundían incluso con visión
 * de color plena. Con estos valores la separación sube a 24.0 en oscuro y 28.7
 * en claro.
 *
 * Que la meta "lea gris" es deliberado: es una línea de REFERENCIA, no una
 * segunda serie con identidad propia.
 */
const SERIES = {
  dark: { sales: "#709DF6", goal: "#60636A", axis: "#92969E", grid: "rgba(255,255,255,0.06)" },
  light: { sales: "#1E5AE2", goal: "#A1A5AC", axis: "#636872", grid: "rgba(21,25,32,0.07)" }
};

const compactMoney = new Intl.NumberFormat("es-MX", {
  style: "currency", currency: "MXN", notation: "compact", maximumFractionDigits: 0
});

/**
 * Recharts 3 dejó de exponer `payload` y `label` en TooltipProps (ahora viajan
 * por contexto), así que se declara la forma que de verdad llega en tiempo de
 * ejecución en vez de pelear con el tipo del paquete.
 */
type TrendTooltipProps = {
  active?: boolean;
  label?: string | number;
  payload?: Array<{ dataKey?: string | number; value?: number }>;
  isDark: boolean;
};

function TrendTooltip({ active, payload, label, isDark }: TrendTooltipProps) {
  if (!active || !payload?.length) return null;
  const sales = Number(payload.find((p) => p.dataKey === "sales")?.value ?? 0);
  const goal = Number(payload.find((p) => p.dataKey === "goal")?.value ?? 0);
  const diff = sales - goal;
  const colors = isDark ? SERIES.dark : SERIES.light;

  return (
    <div className="desk-floating rounded-xl px-3 py-2.5 text-caption">
      <p className="font-medium text-ink">Día {label}</p>
      <dl className="mt-1.5 grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1">
        <dt className="flex items-center gap-1.5 text-muted">
          <span aria-hidden className="h-0.5 w-3 rounded-full" style={{ background: colors.sales }} />
          Venta
        </dt>
        <dd className="text-right font-medium tabular-nums text-ink">{money(sales)}</dd>
        <dt className="flex items-center gap-1.5 text-muted">
          <span aria-hidden className="h-0 w-3 border-t border-dashed" style={{ borderColor: colors.goal }} />
          Meta
        </dt>
        <dd className="text-right tabular-nums text-muted">{goal > 0 ? money(goal) : "—"}</dd>
      </dl>
      {goal > 0 ? (
        <p className={cn("mt-1.5 border-t border-line pt-1.5 font-medium tabular-nums", diff >= 0 ? "text-ok" : "text-danger")}>
          {diff >= 0 ? `Superó por ${money(diff)}` : `Faltaron ${money(Math.abs(diff))}`}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Tendencia de venta contra meta.
 *
 * Lleva leyenda siempre: son dos series, y además la línea de meta queda por
 * debajo de 3:1 contra el lienzo (es recesiva a propósito), lo que obliga a
 * identificarla con una etiqueta visible en vez de solo con color.
 */
export function DeskTrendChart({ data, isDark }: { data: TrendPoint[]; isDark: boolean }) {
  const reduce = useReducedMotion();
  const colors = isDark ? SERIES.dark : SERIES.light;
  const last = data[data.length - 1];

  const total = data.reduce((sum, point) => sum + point.sales, 0);
  const resumen =
    data.length === 0
      ? "Sin datos de tendencia."
      : `Venta diaria contra meta de los últimos ${data.length} días. Del día ${data[0].label} al ${last.label}. Venta acumulada ${money(total)}.`;

  return (
    <figure className="m-0">
      <figcaption className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <span className="text-caption font-medium text-muted">
          Tendencia · últimos {data.length} días
        </span>
        {/* Leyenda: la identidad de cada serie nunca depende solo del color. */}
        <span className="flex items-center gap-4 text-caption text-muted">
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="h-0.5 w-4 rounded-full" style={{ background: colors.sales }} />
            Venta
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="h-0 w-4 border-t border-dashed" style={{ borderColor: colors.goal }} />
            Meta
          </span>
        </span>
      </figcaption>

      <div className="mt-3 h-44" role="img" aria-label={resumen}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="deskSalesFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={colors.sales} stopOpacity={0.32} />
                <stop offset="100%" stopColor={colors.sales} stopOpacity={0} />
              </linearGradient>
            </defs>

            <CartesianGrid stroke={colors.grid} vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: colors.axis, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              minTickGap={16}
            />
            <YAxis
              tick={{ fill: colors.axis, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={56}
              tickFormatter={(value: number) => compactMoney.format(value)}
            />
            <Tooltip
              // Guía vertical al pasar el puntero: sin ella hay que adivinar a
              // qué día pertenece el valor del globo.
              cursor={{ stroke: colors.axis, strokeWidth: 1, strokeDasharray: "3 3" }}
              content={<TrendTooltip isDark={isDark} />}
            />

            <Area
              type="monotone"
              dataKey="goal"
              stroke={colors.goal}
              strokeWidth={1.5}
              strokeDasharray="5 4"
              fill="none"
              dot={false}
              activeDot={false}
              isAnimationActive={!reduce}
              animationDuration={700}
              animationEasing="ease-out"
            />
            <Area
              type="monotone"
              dataKey="sales"
              stroke={colors.sales}
              strokeWidth={2}
              fill="url(#deskSalesFill)"
              isAnimationActive={!reduce}
              animationDuration={900}
              animationEasing="ease-out"
              // Solo el último día lleva punto: marca "aquí estás hoy" sin
              // ensuciar la línea con un punto en cada jornada.
              dot={(props) => {
                const { cx, cy, index } = props as { cx: number; cy: number; index: number };
                if (index !== data.length - 1) return <g key={index} />;
                return (
                  <g key={index}>
                    <circle cx={cx} cy={cy} r={7} fill={colors.sales} opacity={0.18} />
                    <circle cx={cx} cy={cy} r={3.5} fill={colors.sales} stroke={isDark ? "#0B0D11" : "#F9FAFB"} strokeWidth={2} />
                  </g>
                );
              }}
              activeDot={{ r: 4, strokeWidth: 2, stroke: isDark ? "#0B0D11" : "#F9FAFB" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

/**
 * Minigráfica de la tabla de equipo: la forma de los últimos días de un asesor.
 * SVG plano en vez de recharts — son una por fila y montar un gráfico completo
 * por asesor sería caro sin aportar nada.
 *
 * Va aria-hidden: el dato numérico ya está en las celdas de al lado, así que
 * repetirlo en el lector de pantalla solo añadiría ruido.
 */
export function Sparkline({ values, isDark, className }: { values: number[]; isDark: boolean; className?: string }) {
  if (values.length < 2) return <span className={cn("block text-caption text-muted", className)}>—</span>;

  const width = 64;
  const height = 20;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const step = width / (values.length - 1);
  const points = values.map((value, i) => [i * step, height - ((value - min) / span) * (height - 3) - 1.5]);
  const line = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const [lastX, lastY] = points[points.length - 1];
  const rising = values[values.length - 1] >= values[0];
  const color = rising ? (isDark ? "#52C479" : "#137D41") : (isDark ? "#92969E" : "#636872");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} aria-hidden className={cn("overflow-visible", className)}>
      <path d={line} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r={2} fill={color} />
    </svg>
  );
}
