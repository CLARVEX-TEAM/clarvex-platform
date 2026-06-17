import { NextRequest, NextResponse } from "next/server";
import { isApiError, requireSession } from "@/lib/api";
import { notificationScope, serializeNotification } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await requireSession();
  if (isApiError(session)) return session;

  const requestedLimit = Number(request.nextUrl.searchParams.get("limit") ?? 100);
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 100) : 100;
  const where = notificationScope(session);
  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: { createdAt: "desc" }, take: limit }),
    prisma.notification.count({ where: { ...where, readAt: null } })
  ]);

  return NextResponse.json({
    notifications: notifications.map(serializeNotification),
    unreadCount
  }, { headers: { "Cache-Control": "private, no-store" } });
}

// Borra notificaciones del usuario. ?onlyRead=true borra solo las leídas.
export async function DELETE(request: NextRequest) {
  const session = await requireSession();
  if (isApiError(session)) return session;
  const onlyRead = request.nextUrl.searchParams.get("onlyRead") === "true";
  const where = { ...notificationScope(session), ...(onlyRead ? { readAt: { not: null } } : {}) };
  const result = await prisma.notification.deleteMany({ where });
  return NextResponse.json({ deleted: result.count });
}
