import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { isApiError, parseJson, requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { createNotifications } from "@/lib/notifications";
import { dispatchPushToUsers } from "@/lib/push";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  if (isApiError(session)) return session;

  const parsed = await parseJson(request, z.object({ completed: z.boolean() }));
  if ("response" in parsed) return parsed.response;

  const activity = await prisma.dayPlanTask.findFirst({
    where: {
      id,
      plan: {
        storeId: session.storeId,
        ...(session.role === "ASESOR" ? { userId: session.userId } : {}),
      },
    },
    include: {
      plan: { select: { userId: true } },
    },
  });

  if (!activity) {
    return NextResponse.json({ error: "Actividad no encontrada o sin permiso." }, { status: 404 });
  }

  let pushRecipients: string[] = [];
  const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const result = await tx.dayPlanTask.update({
      where: { id: activity.id },
      data: {
        completed: parsed.data.completed,
        completedAt: parsed.data.completed ? new Date() : null,
      },
    });

    if (parsed.data.completed && session.role === "ASESOR") {
      const managers = await tx.user.findMany({
        where: {
          storeId: session.storeId,
          role: { in: ["GERENTE", "SUBGERENTE"] },
          id: { not: session.userId },
        },
        select: { id: true },
      });

      const recipients = new Set<string>(
        managers.map((manager) => manager.id),
      );

      if (activity.plan.userId !== session.userId) {
        recipients.add(activity.plan.userId);
      }

      pushRecipients = Array.from(recipients);
      await createNotifications(
        tx,
        pushRecipients.map((userId: string) => ({
          storeId: session.storeId,
          userId,
          type: "TASK_COMPLETED" as const,
          title: "Actividad completada",
          body: `${session.name} completó "${activity.title}"`,
        })),
      );
    }

    return result;
  });
  if (pushRecipients.length > 0) {
    dispatchPushToUsers(pushRecipients, { title: "✅ Actividad completada", body: `${session.name} completó "${activity.title}"`, tag: "actividad-completada", url: "/plan" }).catch(() => undefined);
  }

  return NextResponse.json({
    id: updated.id,
    title: updated.title,
    completed: updated.completed,
  });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession(["GERENTE", "SUBGERENTE"]);
  if (isApiError(session)) return session;

  const activity = await prisma.dayPlanTask.findFirst({
    where: { id, plan: { storeId: session.storeId } },
    select: { id: true },
  });
  if (!activity) {
    return NextResponse.json({ error: "Actividad no encontrada o sin permiso." }, { status: 404 });
  }

  await prisma.dayPlanTask.delete({ where: { id: activity.id } });
  return NextResponse.json({ ok: true });
}
