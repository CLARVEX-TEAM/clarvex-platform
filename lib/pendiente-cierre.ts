import type { Prisma } from "@prisma/client";

/**
 * Al cerrar un pendiente hay que retirar sus avisos. Notification no guarda a
 * qué pendiente pertenece, y nadie los limpiaba: el aviso de «vencido» se
 * quedaba sin leer en la campana para siempre, así que el usuario seguía viendo
 * que tenía un pendiente vencido después de haberlo cerrado.
 *
 * Lo usan la app (PATCH de `/api/pendings/[id]`) y gerencia desde WhatsApp: dos
 * puertas que cierran lo mismo tienen que limpiar lo mismo.
 */
export async function retirarAvisosDelPendiente(
  tx: Prisma.TransactionClient,
  storeId: string,
  cerrado: { title: string; ownerId: string }
): Promise<void> {
  const readAt = new Date();

  // 1. El aviso directo de asignación lleva el título en el cuerpo, así que
  //    se identifica sin ambigüedad.
  await tx.notification.updateMany({
    where: { storeId, type: "PENDING_ASSIGNED", body: cerrado.title, readAt: null },
    data: { readAt }
  });

  // 2. El recordatorio del cron al responsable ("Tienes N pendientes por
  //    vencer") lista VARIOS títulos en el cuerpo, así que no se puede casar
  //    por texto del pendiente. Se identifica por su título fijo, y solo se
  //    retira si al responsable ya no le queda ninguno abierto.
  const ownerOpen = await tx.pending.count({ where: { storeId, ownerId: cerrado.ownerId, status: { not: "COMPLETADO" } } });
  if (ownerOpen === 0) {
    await tx.notification.updateMany({
      where: { userId: cerrado.ownerId, type: "PENDING_ASSIGNED", readAt: null, title: { contains: "por vencer" } },
      data: { readAt }
    });
  }

  // 3. El resumen de gerencia ("N pendientes vencidos en la tienda") se retira
  //    cuando la tienda se queda sin vencidos. Se filtra por título a propósito:
  //    un barrido de todos los PENDING_ASSIGNED se llevaría por delante un
  //    "Pendiente reasignado" legítimo de un pendiente que sigue abierto.
  const storeOverdue = await tx.pending.count({ where: { storeId, status: { not: "COMPLETADO" }, dueDate: { lt: readAt } } });
  if (storeOverdue === 0) {
    await tx.notification.updateMany({
      where: { storeId, type: "PENDING_ASSIGNED", readAt: null, title: { contains: "en la tienda" } },
      data: { readAt }
    });
  }
}
