"use client";

import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { TrendingUp } from "lucide-react";
import { money } from "@/lib/format";
import type { TrendPoint } from "@/lib/trend";
import { Badge, Card } from "@/components/ui";

const tooltipStyle = {
  background: "#1a2540",
  border: "1px solid #2a3a5c",
  borderRadius: 12,
  color: "#f0f4ff",
  boxShadow: "0 6px 14px rgb(0 0 0 / 0.3)"
};

export function SalesTrendCard({ points, title = "Tendencia de venta" }: { points: TrendPoint[]; title?: string }) {
  return (
    <Card className="p-3.5">
      <div className="mb-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="text-volt" size={18} />
          <h2 className="text-lg font-black">{title}</h2>
        </div>
        {points.length ? <Badge>{points.length} días</Badge> : null}
      </div>
      {points.length < 2 ? (
        <p className="py-6 text-center text-sm font-semibold text-muted">Sin datos suficientes para la tendencia.</p>
      ) : (
        <div className="h-36 overflow-hidden rounded-xl" style={{ background: "#0f172a" }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={points} margin={{ top: 10, right: 8, bottom: 0, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: "#94A3B8", fontSize: 9 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value, name) => [money(Number(value)), name === "sales" ? "Venta" : "Meta"]}
                labelFormatter={(label, payload) => {
                  const date = payload?.[0]?.payload?.date as string | undefined;
                  return date ? new Date(`${date}T00:00:00Z`).toLocaleDateString("es-MX", { day: "numeric", month: "short", timeZone: "UTC" }) : String(label);
                }}
              />
              <Area type="monotone" dataKey="sales" stroke="#3B82F6" fill="rgba(59,130,246,0.25)" strokeWidth={2} animationDuration={700} />
              <Line type="monotone" dataKey="goal" stroke="#94A3B8" strokeDasharray="4 3" strokeWidth={1.5} dot={false} animationDuration={700} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
