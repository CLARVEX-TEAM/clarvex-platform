import { NextResponse } from "next/server";
import { z } from "zod";
import { Role } from "@prisma/client";
import { isApiError, parseJson, requireSession } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { hashPin } from "@/lib/security";

export const dynamic = "force-dynamic";

const createMemberSchema = z.object({
  name: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres.").max(120),
  employeeNumber: z.string().trim().regex(/^\d{1,30}$/, "El número de empleado debe ser numérico."),
  role: z.enum(["GERENTE", "SUBGERENTE", "ASESOR"]),
  pin: z.string().regex(/^\d{4}$/, "El PIN debe tener 4 dígitos.").optional()
});

export async function POST(request: Request) {
  const session = await requireSession(["GERENTE", "SUBGERENTE"]);
  if (isApiError(session)) return session;

  const parsed = await parseJson(request, createMemberSchema);
  if ("response" in parsed) return parsed.response;
  const { name, employeeNumber, role, pin } = parsed.data;

  // Jerarquía de roles: solo un GERENTE (o admin de plataforma) puede crear otro
  // GERENTE. Evita que un SUBGERENTE escale privilegios creando gerencia.
  if (role === "GERENTE" && session.role !== "GERENTE" && !session.platformAdmin) {
    return NextResponse.json({ error: "Solo un gerente puede crear otro gerente." }, { status: 403 });
  }

  const email = `${employeeNumber}@clarvex.local`;
  const conflict = await prisma.user.findFirst({
    where: { OR: [{ employeeNumber }, { email }, { employeeNumberAliases: { some: { employeeNumber } } }] },
    select: { name: true, active: true }
  });
  if (conflict) {
    return NextResponse.json({
      error: conflict.active
        ? `El número de empleado ya pertenece a ${conflict.name}.`
        : `El número de empleado pertenece a ${conflict.name} (cuenta desactivada). Reactívala desde Equipo.`
    }, { status: 409 });
  }

  const user = await prisma.user.create({
    data: {
      name,
      email,
      employeeNumber,
      role: Role[role],
      storeId: session.storeId,
      pinHash: pin ? await hashPin(pin) : null
    },
    select: { id: true, name: true, employeeNumber: true, role: true }
  });

  await recordAudit({
    session, action: "user.create", entity: "User", entityId: user.id,
    storeId: session.storeId,
    detail: `Alta de ${user.name} (#${user.employeeNumber}) como ${user.role}.`
  });

  return NextResponse.json({ user }, { status: 201 });
}
