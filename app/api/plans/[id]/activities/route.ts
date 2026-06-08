import { NextResponse } from "next/server";
import { z } from "zod";
import { isApiError, parseJson, requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession(["GERENTE", "SUBGERENTE"]);
  if (isApiError(session)) return session;
  const parsed = await parseJson(request, z.object({ title: z.string().trim().min(3).max(300) }));
  if ("response" in parsed) return parsed.response;
  const plan = await prisma.dayPlan.findFirst({ where: { id, storeId: session.storeId } });
  if (!plan) return NextResponse.json({ error: "Plan no encontrado." }, { status: 404 });
  const activity = await prisma.dayPlanTask.create({ data: { planId: plan.id, title: parsed.data.title } });
  return NextResponse.json({ activity: { id: activity.id, title: activity.title, completed: activity.completed } }, { status: 201 });
}
