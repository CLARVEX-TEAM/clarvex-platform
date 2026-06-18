import { NextResponse } from "next/server";
import { z } from "zod";
import { isApiError, parseJson, requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { dispatchPushToUsers } from "@/lib/push";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  if (isApiError(session)) return session;
  const parsed = await parseJson(request, z.object({ read: z.boolean() }));
  if ("response" in parsed) return parsed.response;
  const announcement = await prisma.announcement.findFirst({ where: { id, storeId: session.storeId } });
  if (!announcement) return NextResponse.json({ error: "Comunicado no encontrado." }, { status: 404 });
  if (parsed.data.read) {
    await prisma.announcementRead.upsert({ where: { announcementId_userId: { announcementId: id, userId: session.userId } }, update: { readAt: new Date() }, create: { announcementId: id, userId: session.userId } });
    if (session.role === "ASESOR") {
      const managers = await prisma.user.findMany({ where: { storeId: session.storeId, role: { in: ["GERENTE", "SUBGERENTE"] } }, select: { id: true } });
      const managerIds = managers.map((m) => m.id);
      if (managerIds.length > 0) {
        dispatchPushToUsers(managerIds, { title: "👁 Comunicado leído", body: `${session.name} leyó "${announcement.title}"`, tag: "comunicado-leido", url: "/comunicados" }).catch(() => undefined);
      }
    }
  } else {
    await prisma.announcementRead.deleteMany({ where: { announcementId: id, userId: session.userId } });
  }
  return NextResponse.json({ ok: true });
}
