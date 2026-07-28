import { NextResponse } from "next/server";
import { z } from "zod";
import { isApiError, parseJson, requireSession } from "@/lib/api";
import { createNotifications } from "@/lib/notifications";
import { dispatchPushToUsers } from "@/lib/push";
import { prisma } from "@/lib/prisma";
import { SHIFT_TYPE_LABELS, dayBalanceField, formatRequestDate } from "@/lib/shift-requests";

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

  // Solo se descuenta al aprobar por primera vez, y se DEVUELVE si esa aprobación
  // se revierte. Sin la devolución, el ciclo aprobar → rechazar → aprobar cobraba
  // el día dos veces (el saldo solo bajaba, nunca volvía a subir).
  const wasApproved = existing.status === "APROBADO";
  const firstApproval = status === "APROBADO" && !wasApproved;
  const approvalRevoked = status === "RECHAZADO" && wasApproved;
  // ⚠️ Ni las HORAS (entrar tarde / salir temprano) ni las VACACIONES se descuentan
  // aquí. El saldo real lo lleva la ASISTENCIA: cuando la persona marca 13:00 con
  // permiso, el banco de horas ya resta esas 2:30 (lib/hours-balance); y las
  // vacaciones se restan cuando el día aparece como VACATION en Horarios
  // (lib/vacation-account). Descontar también al aprobar se lo cobraba DOS VECES.
  // Aprobar es la INTENCIÓN; el hecho lo registra la asistencia/el horario, que en
  // esta app siempre mandan. El "pago de día" sí es un saldo aparte que nada
  // calcula solo, así que ese se sigue descontando aquí.
  const affectsPaidDays = dayBalanceField(existing.type) === "paidDays";
  const paidDaysDelta = affectsPaidDays && firstApproval ? -1 : affectsPaidDays && approvalRevoked ? 1 : 0;

  await prisma.$transaction(async (tx) => {
    await tx.shiftRequest.update({
      where: { id },
      data: { status, managerNote: managerNote || null, resolvedById: session.userId, resolvedAt: new Date() }
    });
    if (paidDaysDelta !== 0) {
      await tx.user.update({ where: { id: existing.requesterId }, data: { paidDays: { increment: paidDaysDelta } } });
    }
  });

  const title = status === "APROBADO" ? "✅ Solicitud aprobada" : "❌ Solicitud rechazada";
  const verb = status === "APROBADO" ? "aprobada" : "rechazada";
  const body = `Tu solicitud de ${SHIFT_TYPE_LABELS[existing.type] ?? "turno"} para el ${formatRequestDate(existing.date)} fue ${verb}${managerNote ? `: ${managerNote}` : ""}`;
  await createNotifications(prisma, [{ storeId: session.storeId, userId: existing.requesterId, type: "SHIFT_REQUEST", title, body }]);
  dispatchPushToUsers([existing.requesterId], { title, body, tag: "solicitud", url: "/solicitudes" }).catch(() => undefined);

  return NextResponse.json({ id, status });
}
