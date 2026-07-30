import { createNotifications } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { dispatchPushToUsers } from "@/lib/push";
import type { Session } from "@/lib/session-token";

// Creación de comunicados en un solo lugar: la reutilizan tanto la ruta
// POST /api/announcements como la confirmación de acciones del Copilot (Fase 3),
// de modo que TODA creación pase por la misma lógica validada (transacción +
// notificaciones + push) y quede una sola fuente de verdad.
export type CreateAnnouncementInput = {
  title: string;
  body: string;
  imageUrl?: string | null;
};

export async function createAnnouncement(session: Session, input: CreateAnnouncementInput) {
  const { announcement, advisorIds } = await prisma.$transaction(async (tx) => {
    const created = await tx.announcement.create({
      data: { storeId: session.storeId, authorId: session.userId, title: input.title, body: input.body, imageUrl: input.imageUrl ?? null },
      include: { reads: true }
    });
    // El autor cuenta como leído desde el momento en que lo publica. Sin esto,
    // el panel de gerencia le reclamaba "confirma la lectura" de un comunicado
    // que acababa de escribir él mismo.
    await tx.announcementRead.create({ data: { announcementId: created.id, userId: session.userId } });

    const advisors = await tx.user.findMany({ where: { storeId: session.storeId, role: "ASESOR", active: true }, select: { id: true } });
    await createNotifications(tx, advisors.map((advisor) => ({
      storeId: session.storeId,
      userId: advisor.id,
      type: "NEW_ANNOUNCEMENT" as const,
      title: "Nuevo comunicado",
      body: created.title
    })));
    return { announcement: created, advisorIds: advisors.map((advisor) => advisor.id) };
  });

  dispatchPushToUsers(advisorIds, { title: "Nuevo comunicado", body: announcement.title, tag: "comunicado", url: "/comunicados" }).catch(() => undefined);

  return {
    id: announcement.id,
    title: announcement.title,
    body: announcement.body,
    imageUrl: announcement.imageUrl ?? null,
    authorId: announcement.authorId,
    date: announcement.createdAt.toISOString().slice(0, 10),
    readBy: [session.userId],
    reactions: [] as unknown[]
  };
}
