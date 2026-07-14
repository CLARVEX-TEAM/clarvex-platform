import { NextResponse } from "next/server";
import { z } from "zod";
import { isApiError, parseJson, requireSession } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { createNotifications } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { dispatchPushToUsers } from "@/lib/push";
import { canApprove, canRespond, driveInstructions } from "@/lib/shift-swap";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const patchSchema = z.object({
  action: z.enum(["ACEPTAR", "RECHAZAR", "APROBAR", "NO_AUTORIZAR"]),
  managerNote: z.string().trim().max(300).optional()
});

/**
 * PATCH — dos pasos distintos, según quién sea:
 *
 *  - El COMPAÑERO acepta o rechaza (ACEPTAR / RECHAZAR).
 *  - GERENCIA autoriza o niega (APROBAR / NO_AUTORIZAR), pero solo DESPUÉS de que
 *    el compañero aceptó. Nadie puede cambiarle el descanso a alguien por encima
 *    de su voluntad.
 *
 * Al aprobarse NO se escribe el horario: la fuente de verdad sigue siendo el
 * archivo de Horarios. Se le manda a gerencia la instrucción exacta de qué
 * cambiar en el Drive.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (isApiError(session)) return session;
  const { id } = await params;

  const parsed = await parseJson(request, patchSchema);
  if ("response" in parsed) return parsed.response;
  const { action, managerNote } = parsed.data;

  const swap = await prisma.shiftSwap.findFirst({
    where: { id, storeId: session.storeId },
    include: {
      requester: { select: { id: true, name: true } },
      target: { select: { id: true, name: true } }
    }
  });
  if (!swap) return NextResponse.json({ error: "Intercambio no encontrado." }, { status: 404 });

  const manager = session.role === "GERENTE" || session.role === "SUBGERENTE";
  const isResponse = action === "ACEPTAR" || action === "RECHAZAR";

  // ── El compañero responde ────────────────────────────────────────────────
  if (isResponse) {
    if (!canRespond(swap, session.userId)) {
      return NextResponse.json({ error: "No puedes responder este intercambio." }, { status: 403 });
    }
    const status = action === "ACEPTAR" ? "PENDIENTE_GERENCIA" : "RECHAZADO_COMPANERO";
    await prisma.shiftSwap.update({ where: { id }, data: { status, respondedAt: new Date() } });

    if (action === "ACEPTAR") {
      // Ahora le toca a gerencia.
      const managers = await prisma.user.findMany({
        where: { storeId: session.storeId, role: { in: ["GERENTE", "SUBGERENTE"] }, active: true },
        select: { id: true }
      });
      const ids = managers.map((row) => row.id);
      await createNotifications(prisma, ids.map((userId) => ({
        storeId: session.storeId,
        userId,
        type: "SHIFT_REQUEST" as const,
        title: "Cambio de descanso por autorizar",
        body: `${swap.requester.name} y ${swap.target.name} acordaron intercambiar sus descansos.`
      })));
      dispatchPushToUsers(ids, {
        title: "🔄 Cambio por autorizar",
        body: `${swap.requester.name} y ${swap.target.name} acordaron intercambiar sus descansos.`,
        tag: "cambio-turno",
        url: "/solicitudes"
      }).catch(() => undefined);
    }

    dispatchPushToUsers([swap.requesterId], {
      title: action === "ACEPTAR" ? "✅ Tu compañero aceptó" : "❌ Tu compañero no aceptó",
      body: action === "ACEPTAR"
        ? `${swap.target.name} aceptó. Falta la autorización de gerencia.`
        : `${swap.target.name} no aceptó el cambio.`,
      tag: "cambio-turno",
      url: "/solicitudes"
    }).catch(() => undefined);

    return NextResponse.json({ ok: true, status });
  }

  // ── Gerencia autoriza ────────────────────────────────────────────────────
  if (!manager) {
    return NextResponse.json({ error: "Solo gerencia puede autorizar." }, { status: 403 });
  }
  if (!canApprove(swap)) {
    // Sin el sí del compañero, gerencia no puede aprobar por encima de él.
    return NextResponse.json({ error: "El compañero aún no ha aceptado." }, { status: 409 });
  }

  const status = action === "APROBAR" ? "APROBADO" : "RECHAZADO";
  await prisma.shiftSwap.update({
    where: { id },
    data: { status, resolvedById: session.userId, resolvedAt: new Date(), managerNote: managerNote || null }
  });

  await recordAudit({
    session,
    action: "shiftSwap.resolve",
    entity: "ShiftSwap",
    entityId: id,
    storeId: session.storeId,
    detail: `${swap.requester.name} (${swap.requesterDate}) ↔ ${swap.target.name} (${swap.targetDate}): ${status}`
  });

  const both = [swap.requesterId, swap.targetId];
  await createNotifications(prisma, both.map((userId) => ({
    storeId: session.storeId,
    userId,
    type: "SHIFT_REQUEST" as const,
    title: action === "APROBAR" ? "Cambio de descanso autorizado" : "Cambio de descanso no autorizado",
    body: `${swap.requesterDate} ↔ ${swap.targetDate}${managerNote ? ` · ${managerNote}` : ""}`
  })));
  dispatchPushToUsers(both, {
    title: action === "APROBAR" ? "✅ Cambio autorizado" : "❌ Cambio no autorizado",
    body: `${swap.requesterDate} ↔ ${swap.targetDate}`,
    tag: "cambio-turno",
    url: "/solicitudes"
  }).catch(() => undefined);

  return NextResponse.json({
    ok: true,
    status,
    // Qué cambiar en el Drive. La app NO escribe el horario: detecta sola cuándo
    // ya quedó (ver isReflectedInSchedule tras sincronizar Horarios).
    driveInstructions: action === "APROBAR"
      ? driveInstructions({
          requesterName: swap.requester.name,
          requesterDate: swap.requesterDate,
          targetName: swap.target.name,
          targetDate: swap.targetDate
        })
      : []
  });
}
