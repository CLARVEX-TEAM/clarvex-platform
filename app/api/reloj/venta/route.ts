import { NextResponse } from "next/server";
import { resolveMonterreyDate } from "@/lib/cron-time";
import { prisma } from "@/lib/prisma";
import { leerTokenReloj } from "@/lib/reloj";

export const dynamic = "force-dynamic";

/**
 * Lo que enseña el Pixel Watch: la venta de HOY de la tienda, la propia y el
 * top 3. Ligero a propósito: lo pide un reloj, con poca batería y poca red.
 * Solo lee y solo para gerencia activa con el token de `lib/reloj.ts`.
 */
export async function GET(request: Request) {
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const datos = token ? await leerTokenReloj(token) : null;
  if (!datos) return NextResponse.json({ error: "Reloj sin vincular." }, { status: 401 });

  const usuario = await prisma.user.findFirst({
    where: { id: datos.userId, storeId: datos.storeId, active: true, isDemo: false, role: { in: ["GERENTE", "SUBGERENTE"] } },
    select: { sessionVersion: true }
  });
  if (!usuario || usuario.sessionVersion !== datos.sv) return NextResponse.json({ error: "Reloj sin vincular." }, { status: 401 });

  const hoy = resolveMonterreyDate();
  const filas = await prisma.kpi.findMany({
    where: { storeId: datos.storeId, date: hoy.utcDate, user: { checklistOnly: false } },
    select: { userId: true, dailySales: true, dailyGoal: true, updatedAt: true, user: { select: { name: true } } }
  });
  const venta = filas.reduce((t, f) => t + Number(f.dailySales), 0);
  const meta = filas.reduce((t, f) => t + Number(f.dailyGoal), 0);
  const propia = filas.find((f) => f.userId === datos.userId);
  const pct = (v: number, m: number) => (m > 0 ? Math.round((v / m) * 100) : null);
  const primerNombre = (n: string) => {
    const p = n.trim().split(/\s+/)[0] ?? "";
    return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
  };
  const actualizado = filas.reduce<Date | null>((max, f) => (!max || f.updatedAt > max ? f.updatedAt : max), null);

  return NextResponse.json(
    {
      fecha: hoy.dateKey,
      tienda: { venta: Math.round(venta), meta: Math.round(meta), pct: pct(venta, meta) },
      propia: propia ? { venta: Math.round(Number(propia.dailySales)), meta: Math.round(Number(propia.dailyGoal)), pct: pct(Number(propia.dailySales), Number(propia.dailyGoal)) } : null,
      top: filas
        .filter((f) => Number(f.dailySales) > 0)
        .sort((a, b) => Number(b.dailySales) - Number(a.dailySales))
        .slice(0, 3)
        .map((f) => ({ nombre: primerNombre(f.user.name), venta: Math.round(Number(f.dailySales)) })),
      actualizado: actualizado?.toISOString() ?? null
    },
    { headers: { "Cache-Control": "no-store, private" } }
  );
}
