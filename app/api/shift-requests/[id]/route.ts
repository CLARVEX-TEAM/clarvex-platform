import { NextResponse } from "next/server";
import { z } from "zod";
import { isApiError, parseJson, requireSession } from "@/lib/api";
import { createNotifications } from "@/lib/notifications";
import { dispatchPushToUsers } from "@/lib/push";
import { prisma } from "@/lib/prisma";
import { SHIFT_TYPE_LABELS, dayBalanceField, formatRequestDate, isHourType } from "@/lib/shift-requests";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({
  status: z.enum(["APROBADO", "RECHAZADO"]),
  managerNote: z.string().trim().max(280).optional()
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession(["GERENTE", "SUBGERENTE"]);
  if (isApiError(session)) return session;

  const parsed = await parseJson(request, schema);
  if ("response" in parsed) return parsed.response;
  const { status, managerNote } = parsed.data;

  const existing = await prisma.shiftRequest.findFirst({ where: { id, storeId: session.storeId } });
  if (!existing) return NextResponse.json({ error: "Solicitud no encontrada." }, { status: 404 });

  // Solo se descuenta al aprobar por primera vez.
  const firstApproval = status === "APROBADO" && existing.status !== "APROBADO";
  const deductHours = firstApproval && isHourType(existing.type) && existing.hours ? existing.hours : 0;
  const deductDayField = firstApproval ? dayBalanceField(existing.type) : null;

  await prisma.$transaction(async (tx) => {
    await tx.shiftRequest.update({
      where: { id },
      data: { status, managerNote: managerNote || null, resolvedById: session.userId, resolvedAt: new Date() }
    });
    if (deductHours > 0) {
      await tx.user.update({ where: { id: existing.requesterId }, data: { hoursOwed: { decrement: deductHours } } });
    }
    if (deductDayField) {
      await tx.user.update({ where: { id: existing.requesterId }, data: { [deductDayField]: { decrement: 1 } } });
    }
  });

  const title = status === "APROBADO" ? "✅ Solicitud aprobada" : "❌ Solicitud rechazada";
  const verb = status === "APROBADO" ? "aprobada" : "rechazada";
  const body = `Tu solicitud de ${SHIFT_TYPE_LABELS[existing.type] ?? "turno"} para el ${formatRequestDate(existing.date)} fue ${verb}${managerNote ? `: ${managerNote}` : ""}`;
  await createNotifications(prisma, [{ storeId: session.storeId, userId: existing.requesterId, type: "SHIFT_REQUEST", title, body }]);
  dispatchPushToUsers([existing.requesterId], { title, body, tag: "solicitud" }).catch(() => undefined);

  return NextResponse.json({ id, status });
}
