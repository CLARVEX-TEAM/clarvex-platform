import { NextResponse } from "next/server";
import { z } from "zod";
import { Role } from "@prisma/client";
import { isApiError, parseJson, requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const createMemberSchema = z.object({
  name: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres.").max(120),
  employeeNumber: z.string().trim().regex(/^\d{1,30}$/, "El número de empleado debe ser numérico."),
  role: z.enum(["GERENTE", "SUBGERENTE", "ASESOR"])
});

export async function POST(request: Request) {
  const session = await requireSession(["GERENTE", "SUBGERENTE"]);
  if (isApiError(session)) return session;

  const parsed = await parseJson(request, createMemberSchema);
  if ("response" in parsed) return parsed.response;
  const { name, employeeNumber, role } = parsed.data;

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
      storeId: session.storeId
      // pinHash null: la persona crea su PIN en el primer inicio de sesión.
    },
    select: { id: true, name: true, employeeNumber: true, role: true }
  });

  return NextResponse.json({ user }, { status: 201 });
}
