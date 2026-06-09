import { NextResponse } from "next/server";
import { isApiError, requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { deleteFromR2 } from "@/lib/r2";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession(["GERENTE", "SUBGERENTE"]);
  if (isApiError(session)) return session;

  const announcement = await prisma.announcement.findFirst({ where: { id, storeId: session.storeId } });
  if (!announcement) return NextResponse.json({ error: "Comunicado no encontrado." }, { status: 404 });

  await prisma.$transaction([
    prisma.notification.deleteMany({ where: { storeId: session.storeId, type: "NEW_ANNOUNCEMENT", body: announcement.title } }),
    prisma.announcement.delete({ where: { id: announcement.id } })
  ]);

  if (announcement.imageUrl) deleteFromR2(announcement.imageUrl).catch(() => undefined);

  return NextResponse.json({ ok: true });
}
