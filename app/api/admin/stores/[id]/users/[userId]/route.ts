import { NextResponse } from "next/server";
import { z } from "zod";
import { Role } from "@prisma/client";
import { isApiError, parseJson, requirePlatformAdmin } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  role: z.enum(["GERENTE", "SUBGERENTE", "ASESOR"])
});

// Cambio de rol de un miembro de la tienda (solo admin de plataforma).
// Sirve para corregir altas equivocadas (p.ej. subgerente creado como gerente).
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; userId: string }> }) {
  const { id, userId } = await params;
  const session = await requirePlatformAdmin();
  if (isApiError(session)) return session;

  const parsed = await parseJson(request, updateSchema);
  if ("response" in parsed) return parsed.response;

  const user = await prisma.user.findFirst({
    where: { id: userId, storeId: id },
    select: { id: true, name: true, role: true, employeeNumber: true, store: { select: { name: true } } }
  });
  if (!user) return NextResponse.json({ error: "Usuario no encontrado en esta tienda." }, { status: 404 });
  if (user.role === parsed.data.role) {
    return NextResponse.json({ user: { id: user.id, role: user.role } });
  }

  const previousRole = user.role;
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { role: Role[parsed.data.role] },
    select: { id: true, name: true, role: true }
  });

  await recordAudit({
    session, action: "user.role", entity: "User", entityId: user.id,
    storeId: id, storeName: user.store.name,
    detail: `${user.name} (#${user.employeeNumber}): ${previousRole} → ${updated.role}.`
  });

  return NextResponse.json({ user: updated });
}
