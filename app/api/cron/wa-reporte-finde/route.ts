import { NextResponse } from "next/server";
import { requireCron } from "@/lib/cron-auth";
import { resolveMonterreyDate } from "@/lib/cron-time";
import { prisma } from "@/lib/prisma";
import { reporteDeVenta } from "@/lib/reporte-finde";
import { telefonosDe, whatsappReemplazaPush } from "@/lib/whatsapp-canal";
import { enviarAvisoPorWhatsApp } from "@/lib/whatsapp-aviso";

/**
 * Sábados y domingos a las 3 y a las 6 (Monterrey), a gerencia, el reporte de
 * venta del día listo para copiar y mandar a la plaza.
 *
 * Son DOS mensajes: uno que dice qué es y de qué hora es la venta, y el bloque
 * solo, para que al copiarlo no se lleve nada más pegado.
 *
 * ⚠️ La venta es la que esté CAPTURADA a esa hora. Se dice la hora de la última
 * captura: un reporte con la venta de las 11 enviado como si fuera de las 3
 * diría a la plaza que la tienda va peor de lo que va.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HORAS = new Set(["15", "18"]);

function horaDe(fecha: Date): string {
  return new Intl.DateTimeFormat("es-MX", { timeZone: "America/Monterrey", hour: "numeric", minute: "2-digit", hour12: true }).format(fecha);
}

export async function POST(request: Request) {
  const unauthorized = requireCron(request);
  if (unauthorized) return unauthorized;
  if (!whatsappReemplazaPush()) return NextResponse.json({ ok: true, apagado: true });

  const hora = new URL(request.url).searchParams.get("hora") ?? "";
  if (!HORAS.has(hora)) return NextResponse.json({ ok: false, error: "hora debe ser 15 o 18" }, { status: 400 });
  const { utcDate: hoy, dateKey, weekday } = resolveMonterreyDate();
  // Solo sábado (6) y domingo (0).
  if (weekday !== 6 && weekday !== 0) return NextResponse.json({ ok: true, fueraDeDia: true });

  const tipo = `WA_REPORTE_FINDE_${hora}`;
  const stores = await prisma.store.findMany({ select: { id: true, name: true } });
  const resumen = { enviados: 0, tiendas: 0 };

  for (const store of stores) {
    const filas = await prisma.kpi.findMany({
      where: { storeId: store.id, date: hoy, user: { active: true, checklistOnly: false } },
      select: { dailyGoal: true, dailySales: true, transactions: true, traffic: true, updatedAt: true }
    });
    const meta = filas.reduce((t, k) => t + Number(k.dailyGoal), 0);
    if (meta <= 0) continue; // sin metas del día no hay reporte que mandar
    resumen.tiendas += 1;

    const venta = filas.reduce((t, k) => t + Number(k.dailySales), 0);
    const tickets = filas.reduce((t, k) => t + k.transactions, 0);
    // El tráfico es de la TIENDA y viene repetido en cada fila del día: se toma una vez.
    const trafico = filas.reduce((max, k) => Math.max(max, k.traffic ?? 0), 0);
    const capturado = venta !== 0 || tickets > 0;
    const ultima = filas.reduce<Date | null>((max, k) => (!max || k.updatedAt > max ? k.updatedAt : max), null);
    const cierre = await prisma.weeklyPerformanceClose.findFirst({
      where: { storeId: store.id, weekStart: { lte: hoy }, weekEnd: { gte: hoy } },
      select: { upliftPercent: true }
    });

    const bloque = reporteDeVenta({ tienda: store.name, meta, uplift: cierre ? Number(cierre.upliftPercent) : 15, venta, tickets, trafico });
    const aviso = capturado
      ? `📋 *Reporte de venta de las ${hora === "15" ? "3" : "6"} pm* — listo para copiar 👇\n_Venta capturada a las ${ultima ? horaDe(ultima) : "—"}._`
      : `📋 *Reporte de venta de las ${hora === "15" ? "3" : "6"} pm*\n⚠️ Todavía no hay venta capturada de hoy: captúrala y el reporte de abajo sale en $0.00.`;

    const gerencia = await prisma.user.findMany({
      where: { storeId: store.id, active: true, checklistOnly: false, role: { in: ["GERENTE", "SUBGERENTE"] } },
      select: { id: true }
    });
    const telefonos = await telefonosDe(gerencia.map((g) => g.id));
    const ya = new Set(
      (await prisma.dailyNotificationLog.findMany({ where: { date: dateKey, type: tipo }, select: { employeeId: true } })).map((l) => l.employeeId)
    );
    for (const g of gerencia) {
      const tel = telefonos.get(g.id);
      if (!tel || ya.has(g.id)) continue;
      if (!(await enviarAvisoPorWhatsApp({ phone: tel, text: aviso }))) continue;
      await new Promise((r) => setTimeout(r, 1200));
      await enviarAvisoPorWhatsApp({ phone: tel, text: bloque });
      await prisma.dailyNotificationLog.create({ data: { employeeId: g.id, date: dateKey, type: tipo } });
      resumen.enviados += 1;
    }
  }
  return NextResponse.json({ ok: true, ...resumen });
}
