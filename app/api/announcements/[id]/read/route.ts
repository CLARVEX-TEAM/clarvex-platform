import { NextResponse } from "next/server";
import { z } from "zod";
import { isApiError, parseJson, requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await requireSession();
  if (isApiError(session)) return session;
  const parsed = await parseJson(request, z.object({ read: z.boolean() }));
  if ("response" in parsed) return parsed.response;
  const announcement = await prisma.announcement.findFirst({ where: { id: params.id, storeId: session.storeId } });
  if (!announcement) return NextResponse.json({ error: "Comunicado no encontrado." }, { status: 404 });
  if (parsed.data.read) {
    await prisma.announcementRead.upsert({ where: { announcementId_userId: { announcementId: params.id, userId: session.userId } }, update: { readAt: new Date() }, create: { announcementId: params.id, userId: session.userId } });
  } else {
    await prisma.announcementRead.deleteMany({ where: { announcementId: params.id, userId: session.userId } });
  }
  return NextResponse.json({ ok: true });
}
