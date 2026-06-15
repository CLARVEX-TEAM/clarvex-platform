import { NextResponse } from "next/server";
import { z } from "zod";
import { isApiError, parseJson, requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { assignChores, choreTitle, weekdayOf, type ChoreKey, type Counts } from "@/lib/chore-rules";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({ date: z.string().date() });

const DEFAULT_FOCUS = "Operación y piso de venta";
const DEFAULT_MESSAGE = "Plan operativo del día generado automáticamente. Ajusta según las necesidades de la tienda.";

export async function POST(request: Request) {
  const session = await requireSession(["GERENTE", "SUBGERENTE"]);
  if (isApiError(session)) return session;
  const parsed = await parseJson(request, schema);
  if ("response" in parsed) return parsed.response;

  const { date } = parsed.data;
  const dayStart = new Date(`${date}T00:00:00.000Z`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const planDate = new Date(`${date}T12:00:00.000Z`);
  const weekday = weekdayOf(date);
  const storeId = session.storeId;

  const generated = await prisma.$transaction(async (tx) => {
    // 1. Asesores que trabajan ese día (Schedule WORKING). Sin horarios → todos.
    const advisors = await tx.user.findMany({ where: { storeId, role: "ASESOR" }, orderBy: { name: "asc" }, select: { id: true } });
    const schedules = await tx.schedule.findMany({ where: { storeId, date: { gte: dayStart, lt: dayEnd } }, select: { userId: true, status: true } });
    let workingIds: string[];
    if (schedules.length === 0) {
      workingIds = advisors.map((a) => a.id);
    } else {
      const workingSet = new Set(schedules.filter((s) => s.status === "WORKING").map((s) => s.userId));
      workingIds = advisors.filter((a) => workingSet.has(a.id)).map((a) => a.id);
    }
    if (workingIds.length === 0) return { count: 0 };

    // 2. Conteo histórico de rotaciones, excluyendo la fecha objetivo (regeneración estable).
    const history = await tx.choreAssignment.findMany({ where: { storeId }, select: { date: true, choreKey: true, userId: true } });
    const counts: Counts = {};
    for (const row of history) {
      if (row.date >= dayStart && row.date < dayEnd) continue;
      counts[row.choreKey] ??= {};
      counts[row.choreKey][row.userId] = (counts[row.choreKey][row.userId] ?? 0) + 1;
    }

    // 3. Asignación del día.
    const assignment = assignChores({ workingAdvisorIds: workingIds, weekday, counts });

    // 4. Persistir rotaciones (upsert idempotente por [store, date, chore]).
    for (const [choreKey, userId] of Object.entries(assignment.rotating)) {
      await tx.choreAssignment.upsert({
        where: { storeId_date_choreKey: { storeId, date: planDate, choreKey } },
        create: { storeId, date: planDate, choreKey, userId: userId as string },
        update: { userId: userId as string }
      });
    }

    // 5. Tareas por asesor: rotativas asignadas + compartidas (visual) a todos los que trabajan.
    const tasksByAdvisor: Record<string, { autoKey: string; title: string }[]> = {};
    for (const id of workingIds) tasksByAdvisor[id] = [];
    for (const [choreKey, userId] of Object.entries(assignment.rotating)) {
      tasksByAdvisor[userId as string]?.push({ autoKey: choreKey, title: choreTitle(choreKey as ChoreKey, weekday) });
    }
    for (const sharedKey of assignment.shared) {
      for (const id of workingIds) tasksByAdvisor[id].push({ autoKey: sharedKey, title: choreTitle(sharedKey, weekday) });
    }

    // Limpiar actividades auto-generadas previas de TODOS los planes del día (idempotente).
    const dayPlans = await tx.dayPlan.findMany({ where: { storeId, date: { gte: dayStart, lt: dayEnd } }, select: { id: true, userId: true } });
    if (dayPlans.length > 0) {
      await tx.dayPlanTask.deleteMany({ where: { planId: { in: dayPlans.map((p) => p.id) }, autoKey: { not: null } } });
    }
    const planByUser = new Map(dayPlans.map((p) => [p.userId, p.id]));

    for (const id of workingIds) {
      let planId = planByUser.get(id);
      if (!planId) {
        const kpi = await tx.kpi.findFirst({ where: { userId: id, storeId, date: { gte: dayStart, lt: dayEnd } }, select: { dailyGoal: true } });
        // Se crea como BORRADOR (publishedAt: null): el asesor no lo ve hasta que el gerente lo envía.
        const created = await tx.dayPlan.create({
          data: { userId: id, storeId, date: planDate, dailyGoal: kpi?.dailyGoal ?? 0, focus: DEFAULT_FOCUS, message: DEFAULT_MESSAGE, publishedAt: null }
        });
        planId = created.id;
      }
      if (tasksByAdvisor[id].length > 0) {
        await tx.dayPlanTask.createMany({ data: tasksByAdvisor[id].map((t) => ({ planId: planId!, title: t.title, autoKey: t.autoKey })) });
      }
    }

    return { count: workingIds.length };
  });

  return NextResponse.json({ ok: true, generated: generated.count });
}
