import { NextResponse } from "next/server";
import { z } from "zod";
import { isApiError, parseJson, requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await requireSession();
  if (isApiError(session)) return session;
  const parsed = await parseJson(request, z.object({ completed: z.boolean() }));
  if ("response" in parsed) return parsed.response;

  const activity = await prisma.dayPlanTask.findFirst({
    where: { id: params.id, plan: { storeId: session.storeId, ...(session.role === "ASESOR" ? { userId: session.userId } : {}) } }
  });
  if (!activity) return NextResponse.json({ error: "Actividad no encontrada o sin permiso." }, { status: 404 });

  const updated = await prisma.dayPlanTask.update({ where: { id: activity.id }, data: { completed: parsed.data.completed, completedAt: parsed.data.completed ? new Date() : null } });
  return NextResponse.json({ id: updated.id, title: updated.title, completed: updated.completed });
}
