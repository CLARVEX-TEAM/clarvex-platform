import { NextResponse } from "next/server";
import { isApiError, requireSession } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { deleteStoreUser } from "@/lib/user-delete";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Eliminación definitiva de un miembro de la tienda (gerencia). Solo cuentas
// desactivadas y sin historial de KPIs; el resto de reglas están en el helper.
export async function DELETE(_request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const session = await requireSession(["GERENTE", "SUBGERENTE"]);
  if (isApiError(session)) return session;

  const target = await prisma.user.findFirst({
    where: { id: userId, storeId: session.storeId },
    select: { name: true, employeeNumber: true }
  });

  const result = await deleteStoreUser(userId, session.storeId, session.userId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  await recordAudit({
    session, action: "user.delete", entity: "User", entityId: userId,
    storeId: session.storeId,
    detail: target ? `Eliminó definitivamente a ${target.name} (#${target.employeeNumber}).` : "Eliminó una cuenta desactivada."
  });

  return NextResponse.json({ ok: true });
}
