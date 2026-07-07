import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type DeleteUserResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

/**
 * Elimina definitivamente una cuenta de la tienda. Reglas de seguridad:
 * - Debe estar DESACTIVADA (no se borra una cuenta activa por accidente).
 * - No puede tener KPIs (se protege el historial de ventas): si los tiene,
 *   permanece desactivada.
 * - No puede ser uno mismo.
 * Borra en transacción los datos incidentales (auth, chat, notificaciones,
 * lecturas, etc.). Si aún quedara contenido con autoría (comunicados, encuestas,
 * planes…), la eliminación se rechaza en lugar de romper referencias.
 */
export async function deleteStoreUser(userId: string, storeId: string, actingUserId: string): Promise<DeleteUserResult> {
  if (userId === actingUserId) return { ok: false, status: 400, error: "No puedes eliminar tu propia cuenta." };

  const user = await prisma.user.findFirst({ where: { id: userId, storeId }, select: { id: true, active: true } });
  if (!user) return { ok: false, status: 404, error: "Usuario no encontrado en esta tienda." };
  if (user.active) return { ok: false, status: 409, error: "Primero desactiva la cuenta; solo se eliminan cuentas desactivadas." };

  const kpiCount = await prisma.kpi.count({ where: { userId } });
  if (kpiCount > 0) return { ok: false, status: 409, error: "La cuenta tiene historial de ventas (KPIs). Permanece desactivada para conservarlo." };

  try {
    await prisma.$transaction(async (tx) => {
      // Datos incidentales: se pueden borrar sin perder historial de negocio.
      await tx.chatMessageReaction.deleteMany({ where: { userId } });
      await tx.chatMessageRead.deleteMany({ where: { userId } });
      await tx.chatMessageDelivery.deleteMany({ where: { userId } });
      await tx.chatMessageHide.deleteMany({ where: { userId } });
      await tx.chatMessage.deleteMany({ where: { senderId: userId } });
      await tx.chatMember.deleteMany({ where: { userId } });
      await tx.announcementRead.deleteMany({ where: { userId } });
      await tx.announcementReaction.deleteMany({ where: { userId } });
      await tx.surveyResponse.deleteMany({ where: { userId } });
      await tx.trainingResourceView.deleteMany({ where: { userId } });
      await tx.choreAssignment.deleteMany({ where: { userId } });
      await tx.shiftRequest.deleteMany({ where: { requesterId: userId } });
      await tx.kudo.deleteMany({ where: { OR: [{ fromUserId: userId }, { toUserId: userId }] } });
      await tx.schedule.deleteMany({ where: { userId } });
      await tx.notification.deleteMany({ where: { userId } });
      await tx.pushSubscription.deleteMany({ where: { userId } });
      await tx.webAuthnCredential.deleteMany({ where: { userId } });
      await tx.employeeNumberAlias.deleteMany({ where: { userId } });
      await tx.user.delete({ where: { id: userId } });
    });
    return { ok: true };
  } catch (cause) {
    // Referencias restantes (autoría de comunicados, encuestas, planes, etc.):
    // no se rompen; la cuenta se queda desactivada.
    if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === "P2003") {
      return { ok: false, status: 409, error: "La cuenta tiene actividad registrada (comunicados, planes u otros). Permanece desactivada." };
    }
    throw cause;
  }
}
