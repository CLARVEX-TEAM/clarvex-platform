import { NextResponse } from "next/server";
import { z } from "zod";
import { isApiError, parseJson, requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { choreTitle, weekdayOf, type ChoreKey } from "@/lib/chore-rules";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({
  date: z.string().date(),
  choreKey: z.enum(["CICLICO", "BARRER_MOPEAR", "TRAPEAR", "VIDRIOS"]),
  toUserId: z.string().min(1)
});

const DEFAULT_FOCUS = "Operación y piso de venta";
const DEFAULT_MESSAGE = "Plan operativo del día generado automáticamente. Ajusta según las necesidades de la tienda.";

export async function PATCH(request: Request) {
  const session = await requireSession(["GERENTE", "SUBGERENTE"]);
  if (isApiError(session)) return session;
  const parsed = await parseJson(request, schema);
  if ("response" in parsed) return parsed.response;

  const { date, choreKey, toUserId } = parsed.data;
  const storeId = session.storeId;
  const dayStart = new Date(`${date}T00:00:00.000Z`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const planDate = new Date(`${date}T12:00:00.000Z`);
  const weekday = weekdayOf(date);

  const target = await prisma.user.findFirst({ where: { id: toUserId, storeId, role: "ASESOR" }, select: { id: true } });
  if (!target) return NextResponse.json({ error: "El asesor no pertenece a tu tienda." }, { status: 400 });

  const assignment = await prisma.choreAssignment.findUnique({ where: { storeId_date_choreKey: { storeId, date: planDate, choreKey } } });
  if (!assignment) return NextResponse.json({ error: "Genera primero las actividades del día." }, { status: 404 });

  // El gerente decide a quién reasignar (no se bloquea por horario).
  await prisma.$transaction(async (tx) => {
    // Quitar la actividad de esta tarea de cualquier plan del día (el del asesor anterior).
    const dayPlans = await tx.dayPlan.findMany({ where: { storeId, date: { gte: dayStart, lt: dayEnd } }, select: { id: true, userId: true } });
    if (dayPlans.length > 0) {
      await tx.dayPlanTask.deleteMany({ where: { planId: { in: dayPlans.map((p) => p.id) }, autoKey: choreKey } });
    }
    // Asegurar el plan del nuevo asesor.
    let planId = dayPlans.find((p) => p.userId === toUserId)?.id;
    if (!planId) {
      const kpi = await tx.kpi.findFirst({ where: { userId: toUserId, storeId, date: { gte: dayStart, lt: dayEnd } }, select: { dailyGoal: true } });
      const created = await tx.dayPlan.create({ data: { userId: toUserId, storeId, date: planDate, dailyGoal: kpi?.dailyGoal ?? 0, focus: DEFAULT_FOCUS, message: DEFAULT_MESSAGE } });
      planId = created.id;
    }
    await tx.dayPlanTask.create({ data: { planId, title: choreTitle(choreKey as ChoreKey, weekday), autoKey: choreKey } });
    await tx.choreAssignment.update({ where: { id: assignment.id }, data: { userId: toUserId } });
  });

  return NextResponse.json({ ok: true });
}
