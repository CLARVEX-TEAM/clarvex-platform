import { NextResponse } from "next/server";
import { z } from "zod";
import { isApiError, parseJson, requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { createNotifications } from "@/lib/notifications";
import { dispatchPushToUsers } from "@/lib/push";

export const dynamic = "force-dynamic";

const planSchema = z.object({
  userId: z.string().min(1),
  date: z.string().date(),
  dailyGoal: z.number().nonnegative().max(100000000),
  focus: z.string().trim().min(3).max(500),
  message: z.string().trim().min(3).max(1000),
  activities: z.array(z.string().trim().min(3).max(300)).min(1).max(30)
});

export async function POST(request: Request) {
  const session = await requireSession(["GERENTE", "SUBGERENTE"]);
  if (isApiError(session)) return session;
  const parsed = await parseJson(request, planSchema);
  if ("response" in parsed) return parsed.response;
  const user = await prisma.user.findFirst({ where: { id: parsed.data.userId, storeId: session.storeId, role: "ASESOR" } });
  if (!user) return NextResponse.json({ error: "El asesor no pertenece a tu tienda." }, { status: 400 });
  const plan = await prisma.$transaction(async (tx) => {
    const created = await tx.dayPlan.create({
      data: { userId: user.id, storeId: session.storeId, date: new Date(`${parsed.data.date}T12:00:00.000Z`), dailyGoal: parsed.data.dailyGoal, focus: parsed.data.focus, message: parsed.data.message, publishedAt: new Date(), activities: { create: parsed.data.activities.map((title) => ({ title })) } },
      include: { activities: true }
    });
    await createNotifications(tx, [{
      storeId: session.storeId,
      userId: user.id,
      type: "PLAN_READY",
      title: "Tu plan del dia esta listo",
      body: parsed.data.focus
    }]);
    return created;
  });
  dispatchPushToUsers([user.id], { title: "Tu plan del dia esta listo", body: parsed.data.focus, tag: "plan-listo" }).catch(() => undefined);
  return NextResponse.json({ plan: { id: plan.id, userId: plan.userId, date: plan.date.toISOString().slice(0, 10), dailyGoal: Number(plan.dailyGoal), focus: plan.focus, message: plan.message, activities: plan.activities.map((activity) => ({ id: activity.id, title: activity.title, completed: activity.completed })) } }, { status: 201 });
}
