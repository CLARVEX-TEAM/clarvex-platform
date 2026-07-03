import { NextResponse } from "next/server";
import { z } from "zod";
import { Role } from "@prisma/client";
import { isApiError, parseJson, requirePlatformAdmin } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Brackets estándar de comisión por puesto (mismos valores que el seed).
const DEFAULT_COMMISSION_RULES = [
  { role: Role.ASESOR, minAchievement: 0, maxAchievement: 99.99, commissionPercent: 1.53 },
  { role: Role.ASESOR, minAchievement: 100, maxAchievement: 114.99, commissionPercent: 1.91 },
  { role: Role.ASESOR, minAchievement: 115, maxAchievement: null, commissionPercent: 2.29 },
  { role: Role.SUBGERENTE, minAchievement: 0, maxAchievement: 99.99, commissionPercent: 0.93 },
  { role: Role.SUBGERENTE, minAchievement: 100, maxAchievement: 114.99, commissionPercent: 1.16 },
  { role: Role.SUBGERENTE, minAchievement: 115, maxAchievement: null, commissionPercent: 1.39 },
  { role: Role.GERENTE, minAchievement: 0, maxAchievement: 99.99, commissionPercent: 1.25 },
  { role: Role.GERENTE, minAchievement: 100, maxAchievement: 114.99, commissionPercent: 1.56 },
  { role: Role.GERENTE, minAchievement: 115, maxAchievement: null, commissionPercent: 1.87 }
];

const createStoreSchema = z.object({
  name: z.string().trim().min(2, "El nombre de la tienda debe tener al menos 2 caracteres.").max(80),
  manager: z.object({
    name: z.string().trim().min(2, "El nombre del gerente debe tener al menos 2 caracteres.").max(120),
    employeeNumber: z.string().trim().regex(/^\d{1,30}$/, "El número de empleado debe ser numérico."),
    email: z.string().trim().email("El correo no es válido.").max(120).optional()
  })
});

export async function GET() {
  const session = await requirePlatformAdmin();
  if (isApiError(session)) return session;

  const stores = await prisma.store.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      createdAt: true,
      _count: { select: { users: true, dataSources: true } },
      users: { where: { active: true }, select: { id: true } },
      commissionRules: {
        where: { active: true },
        select: { id: true, role: true, minAchievement: true, maxAchievement: true, commissionPercent: true },
        orderBy: [{ role: "asc" }, { minAchievement: "asc" }]
      }
    }
  });

  return NextResponse.json({
    stores: stores.map((store) => ({
      id: store.id,
      name: store.name,
      createdAt: store.createdAt,
      totalUsers: store._count.users,
      activeUsers: store.users.length,
      dataSources: store._count.dataSources,
      commissionRules: store.commissionRules.map((rule) => ({
        id: rule.id,
        role: rule.role,
        minAchievement: Number(rule.minAchievement),
        maxAchievement: rule.maxAchievement === null ? null : Number(rule.maxAchievement),
        commissionPercent: Number(rule.commissionPercent)
      }))
    }))
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const session = await requirePlatformAdmin();
  if (isApiError(session)) return session;

  const parsed = await parseJson(request, createStoreSchema);
  if ("response" in parsed) return parsed.response;
  const { name, manager } = parsed.data;

  const email = manager.email ?? `${manager.employeeNumber}@clarvex.local`;
  const conflict = await prisma.user.findFirst({
    where: { OR: [{ employeeNumber: manager.employeeNumber }, { email }, { employeeNumberAliases: { some: { employeeNumber: manager.employeeNumber } } }] },
    select: { name: true }
  });
  if (conflict) {
    return NextResponse.json({ error: `El número de empleado o correo ya pertenece a ${conflict.name}.` }, { status: 409 });
  }

  const store = await prisma.$transaction(async (tx) => {
    const created = await tx.store.create({ data: { name } });
    await tx.user.create({
      data: {
        name: manager.name,
        email,
        employeeNumber: manager.employeeNumber,
        role: Role.GERENTE,
        storeId: created.id
        // pinHash null: el gerente crea su PIN en el primer inicio de sesión.
      }
    });
    await tx.commissionRule.createMany({
      data: DEFAULT_COMMISSION_RULES.map((rule) => ({ ...rule, storeId: created.id, minSales: 0, maxSales: null, active: true }))
    });
    return created;
  });

  return NextResponse.json({ store: { id: store.id, name: store.name } }, { status: 201 });
}
