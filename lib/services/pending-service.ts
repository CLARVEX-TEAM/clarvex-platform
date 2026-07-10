import { PendingStatus } from "@prisma/client";
import { serializePending } from "@/lib/pending";
import { prisma } from "@/lib/prisma";
import type { Session } from "@/lib/session-token";

// Pendientes abiertos con aislamiento por tienda y rol: un asesor solo ve los
// suyos (ownerId), gerencia ve los de toda la tienda.
export type OpenPendingsParams = {
  statuses?: PendingStatus[];
  limit?: number;
};

export async function getOpenPendings(session: Session, params: OpenPendingsParams = {}) {
  const manager = session.role !== "ASESOR";
  const statuses = params.statuses ?? [PendingStatus.PENDIENTE, PendingStatus.EN_PROCESO];
  const take = Math.min(Math.max(params.limit ?? 25, 1), 100);

  const rows = await prisma.pending.findMany({
    where: {
      storeId: session.storeId,
      status: { in: statuses },
      ...(manager ? {} : { ownerId: session.userId })
    },
    orderBy: [{ priority: "desc" }, { dueDate: "asc" }],
    take,
    include: { owner: { select: { name: true } } }
  });

  return rows.map((row) => ({ ...serializePending(row), owner: row.owner.name }));
}
