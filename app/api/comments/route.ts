import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isApiError, parseJson, requireSession } from "@/lib/api";
import { serializeComment } from "@/lib/discussion";
import { authorizeResource, parseResourceTarget, targetWhere } from "@/lib/evidence";
import { createNotifications } from "@/lib/notifications";
import { dispatchPushToUsers } from "@/lib/push";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await requireSession();
  if (isApiError(session)) return session;
  const target = parseResourceTarget({
    pendingId: request.nextUrl.searchParams.get("pendingId") ?? undefined,
    taskId: request.nextUrl.searchParams.get("taskId") ?? undefined,
    logEntryId: request.nextUrl.searchParams.get("logEntryId") ?? undefined
  });
  if (!target) return NextResponse.json({ error: "Indica exactamente un recurso." }, { status: 400 });
  if (!await authorizeResource(prisma, session, target)) return NextResponse.json({ error: "Recurso no encontrado o sin permiso." }, { status: 404 });
  const comments = await prisma.comment.findMany({
    where: { storeId: session.storeId, ...targetWhere(target) },
    include: { author: { select: { name: true, photoUrl: true } } },
    orderBy: { createdAt: "asc" }
  });
  return NextResponse.json({ comments: comments.map(serializeComment) }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const session = await requireSession();
  if (isApiError(session)) return session;
  const parsed = await parseJson(request, z.object({
    pendingId: z.string().trim().optional(),
    taskId: z.string().trim().optional(),
    logEntryId: z.string().trim().optional(),
    body: z.string().trim().min(1, "Escribe un comentario.").max(1000)
  }));
  if ("response" in parsed) return parsed.response;
  const target = parseResourceTarget(parsed.data);
  if (!target) return NextResponse.json({ error: "Indica exactamente un recurso." }, { status: 400 });
  const resource = await authorizeResource(prisma, session, target);
  if (!resource) return NextResponse.json({ error: "Recurso no encontrado o sin permiso." }, { status: 404 });
  const comment = await prisma.$transaction(async (tx) => {
    const created = await tx.comment.create({
      data: { storeId: session.storeId, authorId: session.userId, ...targetWhere(target), body: parsed.data.body },
      include: { author: { select: { name: true, photoUrl: true } } }
    });
    if (resource.kind === "pending" && resource.recipientId !== session.userId) {
      await createNotifications(tx, [{
        storeId: session.storeId,
        userId: resource.recipientId,
        type: "COMMENT_ADDED",
        title: "Nuevo comentario en pendiente",
        body: resource.title
      }]);
    }
    return created;
  });
  if (resource.kind === "pending" && resource.recipientId !== session.userId) {
    dispatchPushToUsers([resource.recipientId], { title: "Nuevo comentario en pendiente", body: resource.title, tag: "comentario" }).catch(() => undefined);
  }
  return NextResponse.json({ comment: serializeComment(comment) }, { status: 201 });
}
