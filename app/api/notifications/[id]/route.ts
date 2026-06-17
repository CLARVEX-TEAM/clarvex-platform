import { NextResponse } from "next/server";
import { isApiError, requireSession } from "@/lib/api";
import { notificationScope } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  if (isApiError(session)) return session;

  const notification = await prisma.notification.findFirst({ where: { id, ...notificationScope(session) } });
  if (!notification) return NextResponse.json({ error: "Notificacion no encontrada." }, { status: 404 });
  await prisma.notification.delete({ where: { id: notification.id } });
  return NextResponse.json({ ok: true });
}
