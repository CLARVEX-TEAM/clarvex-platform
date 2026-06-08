import { NextResponse } from "next/server";
import { isApiError, requireSession } from "@/lib/api";
import { notificationScope, serializeNotification } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  if (isApiError(session)) return session;

  const notification = await prisma.notification.findFirst({ where: { id, ...notificationScope(session) } });
  if (!notification) return NextResponse.json({ error: "Notificacion no encontrada." }, { status: 404 });
  const updated = notification.readAt ? notification : await prisma.notification.update({ where: { id: notification.id }, data: { readAt: new Date() } });
  return NextResponse.json({ notification: serializeNotification(updated) });
}
