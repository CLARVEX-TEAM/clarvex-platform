"use client";

import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { money } from "@/lib/format";
import type { TrendPoint } from "@/lib/trend";
import { Card } from "@/components/ui";

const tooltipStyle = {
  background: "rgb(var(--ch-card))",
  border: "1px solid rgb(var(--ch-line))",
  borderRadius: 10,
  color: "rgb(var(--ch-ink))",
  fontSize: 12,
  boxShadow: "0 4px 14px rgb(20 21 26 / 0.1)"
};

export function SalesTrendCard({ points, title = "Tendencia de venta" }: { points: TrendPoint[]; title?: string }) {
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[13px] font-semibold tracking-[0.01em] text-ink/90">{title} · 7 días</h2>
        {points.length ? <span className="text-[11px] text-muted">Venta vs meta</span> : null}
      </div>
      {points.length < 2 ? (
        <p className="py-6 text-center text-sm text-muted">Sin datos suficientes para la tendencia.</p>
      ) : (
        <div className="h-32">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={points} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
              <defs>
                <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2563EB" stopOpacity={0.14} />
                  <stop offset="100%" stopColor="#2563EB" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgb(var(--ch-line))" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: "rgb(var(--ch-muted))", fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <Tooltip
                cursor={false}
                contentStyle={tooltipStyle}
                formatter={(value, name) => [money(Number(value)), name === "sales" ? "Venta" : "Meta"]}
                labelFormatter={(label, payload) => {
                  const date = payload?.[0]?.payload?.date as string | undefined;
                  return date ? new Date(`${date}T00:00:00Z`).toLocaleDateString("es-MX", { day: "numeric", month: "short", timeZone: "UTC" }) : String(label);
                }}
              />
              <Area type="monotone" dataKey="sales" stroke="#2563EB" fill="url(#trendFill)" strokeWidth={2.2} animationDuration={700} />
              <Line type="monotone" dataKey="goal" stroke="rgb(var(--ch-muted))" strokeDasharray="4 3" strokeWidth={1.5} dot={false} animationDuration={700} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
