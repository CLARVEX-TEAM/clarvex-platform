import { NextRequest, NextResponse } from "next/server";
import { isApiError, requirePlatformAdmin } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Bitácora de auditoría de la plataforma (solo admin): quién cambió qué.
export async function GET(request: NextRequest) {
  const session = await requirePlatformAdmin();
  if (isApiError(session)) return session;

  const storeId = request.nextUrl.searchParams.get("storeId");
  const entries = await prisma.auditLog.findMany({
    where: storeId ? { storeId } : {},
    orderBy: { createdAt: "desc" },
    take: 200
  });

  // Completar nombres de tienda cuando el registro solo guardó el id.
  const missingIds = Array.from(new Set(entries.filter((entry) => entry.storeId && !entry.storeName).map((entry) => entry.storeId!)));
  const stores = missingIds.length ? await prisma.store.findMany({ where: { id: { in: missingIds } }, select: { id: true, name: true } }) : [];
  const nameById = new Map(stores.map((store) => [store.id, store.name]));

  return NextResponse.json({
    entries: entries.map((entry) => ({
      id: entry.id,
      createdAt: entry.createdAt.toISOString(),
      storeId: entry.storeId,
      storeName: entry.storeName ?? (entry.storeId ? nameById.get(entry.storeId) ?? null : null),
      actorName: entry.actorName,
      action: entry.action,
      entity: entry.entity,
      detail: entry.detail
    }))
  }, { headers: { "Cache-Control": "private, no-store" } });
}
