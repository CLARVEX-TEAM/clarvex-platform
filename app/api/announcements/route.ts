import { NextResponse } from "next/server";
import { z } from "zod";
import { isApiError, parseJson, requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { createNotifications } from "@/lib/notifications";
import { dispatchPushToUsers } from "@/lib/push";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await requireSession(["GERENTE", "SUBGERENTE"]);
  if (isApiError(session)) return session;
  const parsed = await parseJson(request, z.object({ title: z.string().trim().min(3).max(120), body: z.string().trim().min(3).max(2000) }));
  if ("response" in parsed) return parsed.response;
  const { announcement, advisorIds } = await prisma.$transaction(async (tx) => {
    const created = await tx.announcement.create({ data: { storeId: session.storeId, authorId: session.userId, ...parsed.data }, include: { reads: true } });
    const advisors = await tx.user.findMany({ where: { storeId: session.storeId, role: "ASESOR" }, select: { id: true } });
    await createNotifications(tx, advisors.map((advisor) => ({
      storeId: session.storeId,
      userId: advisor.id,
      type: "NEW_ANNOUNCEMENT",
      title: "Nuevo comunicado",
      body: created.title
    })));
    return { announcement: created, advisorIds: advisors.map((advisor) => advisor.id) };
  });
  dispatchPushToUsers(advisorIds, { title: "Nuevo comunicado", body: announcement.title }).catch(() => undefined);
  return NextResponse.json({ announcement: { id: announcement.id, title: announcement.title, body: announcement.body, authorId: announcement.authorId, date: announcement.createdAt.toISOString().slice(0, 10), readBy: [] } }, { status: 201 });
}
