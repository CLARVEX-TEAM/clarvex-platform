import { NextResponse } from "next/server";
import { requireAdminCapture } from "@/lib/admin-capture-auth";
import { dashboardDateKey, dashboardDateRange } from "@/lib/dashboard-kpi";
import { prisma } from "@/lib/prisma";
import { slackOpsConfigurado } from "@/lib/slack-ops";
import { PERSON_WHERE } from "@/lib/store-people";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function dateKey(value: Date | null | undefined): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function isTruthyHeader(value: string | null): boolean {
  return /^(1|true|yes|si)$/i.test((value ?? "").trim());
}

function daysBetween(leftKey: string, rightKey: string): number {
  const left = Date.parse(`${leftKey}T00:00:00.000Z`);
  const right = Date.parse(`${rightKey}T00:00:00.000Z`);
  return Math.round((right - left) / 86_400_000);
}

/**
 * Centro operativo privado para Retool.
 *
 * `ADMIN_CAPTURE_SECRET` prueba que la llamada viene del backend de Retool; el
 * encabezado `X-Clarvex-Platform-Admin` prueba que ESA función Retool ya validó
 * la metadata del usuario. No se acepta una tienda desde el navegador.
 */
export async function GET(request: Request) {
  const unauthorized = requireAdminCapture(request);
  if (unauthorized) return unauthorized;
  if (!isTruthyHeader(request.headers.get("x-clarvex-platform-admin"))) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const today = dashboardDateKey();
  const todayStart = dashboardDateRange(today).start;

  const [
    stores,
    activeUsers,
    activeManagers,
    latestKpis,
    pendingHigh,
    pendingRequests,
    openInventoryRounds,
    draftWeeklyCloses,
    recentAudit,
    syncErrors
  ] = await Promise.all([
    prisma.store.findMany({
      select: {
        id: true,
        name: true,
        kpisEnabled: true,
        billingExempt: true,
        subscriptionPaidUntil: true,
        users: { where: { active: true }, select: { id: true } }
      },
      orderBy: { name: "asc" }
    }),
    prisma.user.count({ where: { active: true } }),
    prisma.user.count({ where: { active: true, role: { in: ["GERENTE", "SUBGERENTE"] } } }),
    prisma.kpi.groupBy({
      by: ["storeId"],
      where: { user: PERSON_WHERE },
      _max: { date: true }
    }),
    prisma.pending.count({ where: { status: { not: "COMPLETADO" }, priority: { in: ["ALTA", "CRITICA"] } } }),
    prisma.shiftRequest.count({ where: { status: "PENDIENTE" } }),
    prisma.inventoryRound.count({ where: { closedAt: null } }),
    prisma.weeklyPerformanceClose.count({ where: { status: "DRAFT", weekEnd: { lt: todayStart } } }),
    prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 40 }),
    prisma.syncLog.findMany({
      where: { status: "ERROR" },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { dataSource: { include: { store: { select: { id: true, name: true } } } } }
    })
  ]);

  const latestByStore = new Map(latestKpis.map((row) => [row.storeId, dateKey(row._max.date)]));
  const storeRows = stores.map((store) => {
    const latestKpiDate = latestByStore.get(store.id) ?? null;
    const daysSinceKpi = latestKpiDate ? daysBetween(latestKpiDate, today) : null;
    const captureStatus = !store.kpisEnabled
      ? "disabled"
      : !latestKpiDate
        ? "never"
        : daysSinceKpi !== null && daysSinceKpi > 2
          ? "stale"
          : "ok";
    return {
      id: store.id,
      name: store.name,
      kpisEnabled: store.kpisEnabled,
      activeUsers: store.users.length,
      billingExempt: store.billingExempt,
      subscriptionPaidUntil: dateKey(store.subscriptionPaidUntil),
      latestKpiDate,
      daysSinceKpi,
      captureStatus
    };
  });

  return NextResponse.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    today,
    summary: {
      stores: stores.length,
      enabledStores: storeRows.filter((store) => store.kpisEnabled).length,
      staleCaptureStores: storeRows.filter((store) => store.captureStatus === "stale").length,
      activeUsers,
      activeManagers,
      highPriorityPendings: pendingHigh,
      pendingShiftRequests: pendingRequests,
      openInventoryRounds,
      draftWeeklyCloses,
      slackOpsConfigured: slackOpsConfigurado(),
      n8nOpsConfigured: Boolean(process.env.WEBHOOK_URL)
    },
    stores: storeRows,
    audit: recentAudit.map((entry) => ({
      id: entry.id,
      createdAt: entry.createdAt.toISOString(),
      storeId: entry.storeId,
      storeName: entry.storeName,
      actorName: entry.actorName,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      detail: entry.detail
    })),
    syncErrors: syncErrors.map((entry) => ({
      id: entry.id,
      createdAt: entry.createdAt.toISOString(),
      storeId: entry.dataSource.storeId,
      storeName: entry.dataSource.store.name,
      sourceType: entry.dataSource.type,
      message: entry.message,
      recordsProcessed: entry.recordsProcessed
    }))
  }, { headers: { "Cache-Control": "private, no-store" } });
}
