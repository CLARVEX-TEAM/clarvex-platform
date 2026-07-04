import { NextResponse } from "next/server";
import { z } from "zod";
import { isApiError, parseJson, requireSession } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const kpiTargetInput = z.object({
  metric: z.string().min(1),
  value: z.number().min(0),
  period: z.enum(["SEMANA", "MES"]),
});

export async function GET() {
  const session = await requireSession();
  if (isApiError(session)) return session;

  const targets = await prisma.kpiTarget.findMany({
    where: { storeId: session.storeId },
    orderBy: { metric: "asc" },
  });

  return NextResponse.json({ targets: targets.map((t) => ({ ...t, value: Number(t.value) })) });
}

export async function POST(request: Request) {
  const session = await requireSession(["GERENTE", "SUBGERENTE"]);
  if (isApiError(session)) return session;

  const parsed = await parseJson(request, kpiTargetInput);
  if ("response" in parsed) return parsed.response;

  const { metric, value, period } = parsed.data;

  const target = await prisma.kpiTarget.upsert({
    where: { storeId_metric_period: { storeId: session.storeId, metric, period } },
    update: { value, createdBy: session.userId, updatedAt: new Date() },
    create: { storeId: session.storeId, metric, value, period, createdBy: session.userId },
  });

  await recordAudit({
    session, action: "target.update", entity: "KpiTarget", entityId: target.id,
    storeId: session.storeId,
    detail: `Meta interna ${metric} (${period}) → ${value}.`
  });

  return NextResponse.json({ target: { ...target, value: Number(target.value) } });
}
