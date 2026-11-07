import { NextResponse } from "next/server";
import { NotificationType } from "@prisma/client";
import { requireCron } from "@/lib/cron-auth";
import { resolveMonterreyDate, retailWeekRange } from "@/lib/cron-time";
import { money } from "@/lib/format";
import { aggregateKpis, aggregateStore, aggregateStoreTraffic } from "@/lib/kpi-report";
import { createNotifications, type NotificationInput } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { avisar } from "@/lib/whatsapp-canal";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Cierre semanal automático (domingo por la noche): avisa a gerencia con el
// link de descarga del Excel y publica el resumen de la semana que terminó
// en el chat grupal de la tienda.

const PUSH_TAG = "cierre-excel";
const LOG_TYPE = "WEEKLY_CLOSE_REPORT";

const dateKeyOf = (date: Date) => date.toISOString().slice(0, 10);

export async function POST(request: Request) {
  const unauthorized = requireCron(request);
  if (unauthorized) return unauthorized;

  const { dateKey, utcDate } = resolveMonterreyDate();
  // Semana que acaba de terminar: la anterior a la semana retail actual.
  const { weekStart } = retailWeekRange(utcDate);
  const prevWeekEnd = new Date(weekStart);
  prevWeekEnd.setUTCDate(prevWeekEnd.getUTCDate() - 1);
  const prevWeekStart = new Date(prevWeekEnd);
  prevWeekStart.setUTCDate(prevWeekStart.getUTCDate() - 6);

  const stores = await prisma.store.findMany({ select: { id: true, name: true } });
  const summary = { date: dateKey, stores: stores.length, reportsSent: 0, chatMessages: 0, skipped: 0 };

  for (const store of stores) {
    const [rows, managers, sentLog] = await Promise.all([
      prisma.kpi.findMany({
        where: { storeId: store.id, date: { gte: prevWeekStart, lte: prevWeekEnd } },
        include: { user: { select: { name: true, role: true, photoUrl: true } } },
        orderBy: [{ date: "asc" }, { userId: "asc" }]
      }),
      prisma.user.findMany({ where: { storeId: store.id, active: true, role: { in: ["GERENTE", "SUBGERENTE"] } }, select: { id: true, role: true } }),
      prisma.dailyNotificationLog.findFirst({ where: { date: dateKey, type: LOG_TYPE, employeeId: store.id } })
    ]);
    if (rows.length === 0 || sentLog) {
      summary.skipped += 1;
      continue;
    }

    const reports = aggregateKpis(rows);
    const storeAgg = aggregateStore(reports, aggregateStoreTraffic(rows));
    if (!storeAgg || storeAgg.sales <= 0) {
      summary.skipped += 1;
      continue;
    }
    const weekNumber = rows.find((row) => row.weekNumber !== null)?.weekNumber ?? null;
    const weekLabel = weekNumber ? `Semana ${weekNumber}` : "la semana";
    const achievement = Math.round(storeAgg.achievement);
    const top = reports.filter((report) => report.role === "ASESOR").sort((a, b) => b.sales - a.sales)[0] ?? null;
    const reportUrl = `/api/reports/kpis?start=${dateKeyOf(prevWeekStart)}&end=${dateKeyOf(prevWeekEnd)}&period=week${weekNumber ? `&week=${weekNumber}` : ""}&label=${encodeURIComponent(weekLabel)}`;

    // Push a gerencia con el link directo de descarga del Excel
    const managerIds = managers.map((manager) => manager.id);
    const pushTitle = `📊 Cierre de ${weekLabel} listo`;
    const pushBody = `Venta ${money(storeAgg.sales)} · ${achievement}% de alcance. Toca para descargar el Excel.`;
    const notifications: NotificationInput[] = managerIds.map((id) => ({
      storeId: store.id, userId: id, type: NotificationType.DAILY_SUMMARY, title: pushTitle, body: pushBody
    }));

    // Mensaje al chat grupal de la tienda (lo firma la gerencia principal)
    const groupRoom = await prisma.chatRoom.findFirst({ where: { storeId: store.id, type: "GROUP" }, select: { id: true } });
    const sender = managers.find((manager) => manager.role === "GERENTE") ?? managers[0] ?? null;
    const goalMet = achievement >= 100;
    const chatBody = [
      `🏁 ¡${weekLabel} cerrada, equipo!`,
      "",
      `💰 Venta: ${money(storeAgg.sales)} de ${money(storeAgg.goal)} (${achievement}%) ${goalMet ? "🔥" : "💪"}`,
      top ? `👑 MVP de la semana: ${top.userName.split(/\s+/)[0]} con ${money(top.sales)}` : null,
      `🎟️ ${storeAgg.transactions} tickets · 🛍️ ${storeAgg.pieces} piezas`,
      "",
      goalMet ? "¡META SUPERADA! Aplausos para todos 🏆👏" : "La próxima semana vamos por esa meta 🚀",
      "",
      "📎 Gerencia: el Excel del cierre ya está listo en KPIs → Exportar reporte."
    ].filter((line) => line !== null).join("\n");

    await prisma.$transaction(async (tx) => {
      await createNotifications(tx, notifications);
      if (groupRoom && sender) {
        await tx.chatMessage.create({ data: { roomId: groupRoom.id, senderId: sender.id, body: chatBody } });
        summary.chatMessages += 1;
      }
      await tx.dailyNotificationLog.create({ data: { employeeId: store.id, date: dateKey, type: LOG_TYPE, case: null, sent: true } });
    });

    if (managerIds.length > 0) {
      await avisar(managerIds, { title: pushTitle, body: pushBody, tag: PUSH_TAG, url: reportUrl }).catch(() => undefined);
    }
    summary.reportsSent += 1;
  }

  return NextResponse.json(summary);
}
