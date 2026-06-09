import { NextResponse } from "next/server";
import { isApiError, requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession(["GERENTE", "SUBGERENTE"]);
  if (isApiError(session)) return session;

  const plan = await prisma.dayPlan.findFirst({ where: { id, storeId: session.storeId } });
  if (!plan) return NextResponse.json({ error: "Plan no encontrado." }, { status: 404 });

  await prisma.$transaction([
    prisma.notification.deleteMany({ where: { storeId: session.storeId, userId: plan.userId, type: "PLAN_READY" } }),
    prisma.dayPlan.delete({ where: { id: plan.id } })
  ]);

  return NextResponse.json({ ok: true });
}
