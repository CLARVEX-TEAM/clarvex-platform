import { NextResponse } from "next/server";
import { z } from "zod";
import { isApiError, parseJson, requirePlatformAdmin } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Solo se editan los porcentajes por zonificación; los rangos de alcance
// (≤99.99 / 100–114.99 / ≥115) son fijos e identifican cada bracket.
const updateSchema = z.object({
  rules: z.array(z.object({
    role: z.enum(["GERENTE", "SUBGERENTE", "ASESOR"]),
    minAchievement: z.union([z.literal(0), z.literal(100), z.literal(115)]),
    commissionPercent: z.number().min(0, "El porcentaje no puede ser negativo.").max(100, "El porcentaje no puede superar 100.")
  })).min(1).max(9)
});

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requirePlatformAdmin();
  if (isApiError(session)) return session;

  const parsed = await parseJson(request, updateSchema);
  if ("response" in parsed) return parsed.response;

  const store = await prisma.store.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!store) return NextResponse.json({ error: "Tienda no encontrada." }, { status: 404 });

  const existing = await prisma.commissionRule.findMany({
    where: { storeId: id, active: true },
    select: { id: true, role: true, minAchievement: true }
  });
  const byKey = new Map(existing.map((rule) => [`${rule.role}:${Number(rule.minAchievement)}`, rule.id]));

  const missing = parsed.data.rules.filter((rule) => !byKey.has(`${rule.role}:${rule.minAchievement}`));
  if (missing.length > 0) {
    return NextResponse.json({ error: "La tienda no tiene los brackets estándar; revisa sus reglas de comisión." }, { status: 409 });
  }

  await prisma.$transaction(
    parsed.data.rules.map((rule) => prisma.commissionRule.update({
      where: { id: byKey.get(`${rule.role}:${rule.minAchievement}`)! },
      data: { commissionPercent: rule.commissionPercent }
    }))
  );

  await recordAudit({
    session, action: "commission.update", entity: "CommissionRule",
    storeId: store.id, storeName: store.name,
    detail: parsed.data.rules.map((rule) => `${rule.role} ${rule.minAchievement}%+ → ${rule.commissionPercent}%`).join(" · ")
  });

  return NextResponse.json({ ok: true });
}
