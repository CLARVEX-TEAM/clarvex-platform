import { NextResponse } from "next/server";
import { z } from "zod";
import { isApiError, parseJson, requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { createNotifications } from "@/lib/notifications";

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
      evidences: { select: { id: true }, take: 1 },
    },
  });

  if (!activity) {
    return NextResponse.json({ error: "Actividad no encontrada o sin permiso." }, { status: 404 });
  }

  const updated = await prisma.$transaction(async (tx: any) => {
    const result = await tx.dayPlanTask.update({
      where: { id: activity.id },
      data: {
        completed: parsed.data.completed,
        completedAt: parsed.data.completed ? new Date() : null,
      },
    });

    if (parsed.data.completed && activity.evidences.length > 0) {
      const managers = await tx.user.findMany({
        where: {
          storeId: session.storeId,
          role: { in: ["GERENTE", "SUBGERENTE"] },
          id: { not: session.userId },
        },
        select: { id: true },
      });

      const recipients = new Set<string>(
        managers.map((manager: { id: string }) => manager.id),
      );

      if (activity.plan.userId !== session.userId) {
        recipients.add(activity.plan.userId);
      }

      await createNotifications(
        tx,
        Array.from(recipients).map((userId: string) => ({
          storeId: session.storeId,
          userId,
          type: "TASK_COMPLETED" as const,
          title: "Actividad completada con evidencia",
          body: activity.title,
        })),
      );
    }

    return result;
  });

  return NextResponse.json({
    id: updated.id,
    title: updated.title,
    completed: updated.completed,
  });
}
