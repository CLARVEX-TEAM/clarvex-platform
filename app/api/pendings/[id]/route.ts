import { NextResponse } from "next/server";
import { z } from "zod";
import { isApiError, parseJson, requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { pendingInput, serializePending } from "@/lib/pending";
import { createNotifications } from "@/lib/notifications";
import { dispatchPushToUsers } from "@/lib/push";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession(["GERENTE", "SUBGERENTE"]);
  if (isApiError(session)) return session;

  const pending = await prisma.pending.findFirst({ where: { id, storeId: session.storeId } });
  if (!pending) return NextResponse.json({ error: "Pendiente no encontrado." }, { status: 404 });

  await prisma.$transaction([
    prisma.notification.deleteMany({ where: { storeId: session.storeId, type: "PENDING_ASSIGNED", body: pending.title } }),
    prisma.pending.delete({ where: { id: pending.id } })
  ]);

  return NextResponse.json({ ok: true });
}

export const dynamic = "force-dynamic";

const updateSchema = pendingInput.partial();

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession(["GERENTE", "SUBGERENTE"]);
  if (isApiError(session)) return session;
  const parsed = await parseJson(request, updateSchema);
  if ("response" in parsed) return parsed.response;
  const current = await prisma.pending.findFirst({ where: { id, storeId: session.storeId } });
  if (!current) return NextResponse.json({ error: "Pendiente no encontrado." }, { status: 404 });
  if (parsed.data.ownerId) {
    const owner = await prisma.user.findFirst({ where: { id: parsed.data.ownerId, storeId: session.storeId } });
    if (!owner) return NextResponse.json({ error: "El responsable no pertenece a tu tienda." }, { status: 400 });
  }
  const { dueDate, ...data } = parsed.data;
  const item = await prisma.$transaction(async (tx) => {
    const updated = await tx.pending.update({ where: { id: current.id }, data: { ...data, ...(dueDate ? { dueDate: new Date(`${dueDate}T12:00:00.000Z`) } : {}) } });
    if (parsed.data.ownerId && parsed.data.ownerId !== current.ownerId) {
      await createNotifications(tx, [{
        storeId: session.storeId,
        userId: parsed.data.ownerId,
        type: "PENDING_ASSIGNED",
        title: "Pendiente reasignado",
        body: updated.title
      }]);
    }

    // Al cerrar un pendiente hay que retirar sus avisos. Notification no guarda
    // a qué pendiente pertenece, y nadie los limpiaba: el aviso de "vencido" se
    // quedaba sin leer en la campana para siempre, así que el usuario seguía
    // viendo que tenía un pendiente vencido después de haberlo cerrado.
    if (updated.status === "COMPLETADO") {
      const readAt = new Date();

      // 1. El aviso directo de asignación lleva el título en el cuerpo, así que
      //    se identifica sin ambigüedad.
      await tx.notification.updateMany({
        where: { storeId: session.storeId, type: "PENDING_ASSIGNED", body: updated.title, readAt: null },
        data: { readAt }
      });

      // 2. El recordatorio del cron al responsable ("Tienes N pendientes por
      //    vencer") lista VARIOS títulos en el cuerpo, así que no se puede
      //    casar por texto del pendiente. Se identifica por su título fijo, y
      //    solo se retira si al responsable ya no le queda ninguno abierto.
      const ownerOpen = await tx.pending.count({
        where: { storeId: session.storeId, ownerId: updated.ownerId, status: { not: "COMPLETADO" } }
      });
      if (ownerOpen === 0) {
        await tx.notification.updateMany({
          where: {
            userId: updated.ownerId, type: "PENDING_ASSIGNED", readAt: null,
            title: { contains: "por vencer" }
          },
          data: { readAt }
        });
      }

      // 3. El resumen de gerencia ("N pendientes vencidos en la tienda") se
      //    retira cuando la tienda se queda sin vencidos.
      //    Se filtra por título a propósito: un barrido de todos los
      //    PENDING_ASSIGNED se llevaría por delante un "Pendiente reasignado"
      //    legítimo de un pendiente que sigue abierto.
      const storeOverdue = await tx.pending.count({
        where: { storeId: session.storeId, status: { not: "COMPLETADO" }, dueDate: { lt: readAt } }
      });
      if (storeOverdue === 0) {
        await tx.notification.updateMany({
          where: {
            storeId: session.storeId, type: "PENDING_ASSIGNED", readAt: null,
            title: { contains: "en la tienda" }
          },
          data: { readAt }
        });
      }
    }

    return updated;
  });
  if (parsed.data.ownerId && parsed.data.ownerId !== current.ownerId) {
    dispatchPushToUsers([parsed.data.ownerId], { title: "Pendiente reasignado", body: item.title, tag: "pendiente-reasignado", url: "/pendientes" }).catch(() => undefined);
  }
  return NextResponse.json({ pending: serializePending(item) });
}
