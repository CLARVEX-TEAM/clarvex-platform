import { NextResponse } from "next/server";
import { z } from "zod";
import { isApiError, parseJson, requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { createNotifications } from "@/lib/notifications";
import { dispatchPushToUsers } from "@/lib/push";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({ date: z.string().date() });

export async function POST(request: Request) {
  const session = await requireSession(["GERENTE", "SUBGERENTE"]);
  if (isApiError(session)) return session;
  const parsed = await parseJson(request, schema);
  if ("response" in parsed) return parsed.response;

  const { date } = parsed.data;
  const storeId = session.storeId;
  const dayStart = new Date(`${date}T00:00:00.000Z`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  // Borradores (publishedAt null) del día → se publican y se notifica a cada asesor.
  const drafts = await prisma.dayPlan.findMany({
    where: { storeId, date: { gte: dayStart, lt: dayEnd }, publishedAt: null },
    select: { id: true, userId: true, focus: true }
  });
  if (drafts.length === 0) return NextResponse.json({ ok: true, published: 0 });

  await prisma.$transaction(async (tx) => {
    await tx.dayPlan.updateMany({ where: { id: { in: drafts.map((p) => p.id) } }, data: { publishedAt: new Date() } });
    await createNotifications(tx, drafts.map((p) => ({
      storeId,
      userId: p.userId,
      type: "PLAN_READY" as const,
      title: "Tu plan del día está listo",
      body: p.focus
    })));
  });

  dispatchPushToUsers(drafts.map((p) => p.userId), { title: "Tu plan del día está listo", body: "Revisa tus actividades de hoy.", tag: "plan-listo" }).catch(() => undefined);

  return NextResponse.json({ ok: true, published: drafts.length });
}
