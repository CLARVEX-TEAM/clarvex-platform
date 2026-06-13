import { NextResponse } from "next/server";
import { z } from "zod";
import { isApiError, parseJson, requireSession } from "@/lib/api";
import { createNotifications } from "@/lib/notifications";
import { dispatchPushToUsers } from "@/lib/push";
import { isValidReaction } from "@/lib/reactions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const reactionSchema = z.object({ emoji: z.string().refine(isValidReaction, "Reacción no permitida.") });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  if (isApiError(session)) return session;

  const parsed = await parseJson(request, reactionSchema);
  if ("response" in parsed) return parsed.response;
  const { emoji } = parsed.data;

  const announcement = await prisma.announcement.findFirst({
    where: { id, storeId: session.storeId },
    select: { id: true, title: true, authorId: true }
  });
  if (!announcement) return NextResponse.json({ error: "Comunicado no encontrado." }, { status: 404 });

  const existing = await prisma.announcementReaction.findUnique({
    where: { announcementId_userId_emoji: { announcementId: id, userId: session.userId, emoji } }
  });

  let added: boolean;
  if (existing) {
    await prisma.announcementReaction.delete({ where: { id: existing.id } });
    added = false;
  } else {
    await prisma.announcementReaction.create({ data: { announcementId: id, userId: session.userId, emoji } });
    added = true;

    // Avisar al autor (campana + push), salvo que reaccione a su propio comunicado.
    if (announcement.authorId !== session.userId) {
      const title = "Nueva reacción";
      const body = `${session.name} reaccionó ${emoji} a "${announcement.title}"`;
      await createNotifications(prisma, [{
        storeId: session.storeId,
        userId: announcement.authorId,
        type: "ANNOUNCEMENT_REACTION",
        title,
        body
      }]);
      dispatchPushToUsers([announcement.authorId], { title, body, tag: "reaccion-comunicado" }).catch(() => undefined);
    }
  }

  const reactions = await prisma.announcementReaction.findMany({
    where: { announcementId: id },
    select: { emoji: true, userId: true }
  });

  return NextResponse.json({ added, reactions });
}
