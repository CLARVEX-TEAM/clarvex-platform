import { z } from "zod";
import { ProposalError } from "@/lib/ai/errors";
import type { CopilotContext } from "@/lib/ai/types";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { createAnnouncement } from "@/lib/services/announcement-service";
import type { Session } from "@/lib/session-token";

// Fase 3 — acciones con confirmación explícita.
//
// Flujo seguro en dos pasos:
// 1) El modelo llama a una herramienta "propose..." → se PERSISTE una propuesta
//    (AiRecommendationHistory, estado pendiente). NO se ejecuta nada.
// 2) El usuario confirma por un endpoint aparte → se revalida rol/tienda desde
//    la sesión ACTUAL, se ejecuta por la vía validada (createAnnouncement) y se
//    audita. El cliente solo envía el proposalId; el payload sale del servidor
//    (no se confía en lo que reenvíe el cliente).

export const ACTION_TYPES = { CREATE_ANNOUNCEMENT: "ACTION_CREATE_ANNOUNCEMENT" } as const;
export type ActionType = (typeof ACTION_TYPES)[keyof typeof ACTION_TYPES];

// Las propuestas caducan: evita ejecutar intenciones viejas fuera de contexto.
const PROPOSAL_TTL_MS = 60 * 60 * 1000;

const announcementPayloadSchema = z.object({
  title: z.string().trim().min(3).max(120),
  body: z.string().trim().min(3).max(2000)
});

export type ProposalSummary = {
  proposalId: string;
  type: ActionType;
  summary: string;
  requiresConfirmation: true;
};

export async function proposeCreateAnnouncement(ctx: CopilotContext, payload: { title: string; body: string }): Promise<ProposalSummary> {
  const clean = announcementPayloadSchema.parse(payload);
  const summary = `Comunicado propuesto: "${clean.title}"`;
  const record = await prisma.aiRecommendationHistory.create({
    data: {
      storeId: ctx.storeId,
      userId: ctx.userId,
      type: ACTION_TYPES.CREATE_ANNOUNCEMENT,
      recommendation: JSON.stringify({ payload: clean, summary })
    }
  });
  return { proposalId: record.id, type: ACTION_TYPES.CREATE_ANNOUNCEMENT, summary, requiresConfirmation: true };
}

// Ejecuta una propuesta pendiente tras la confirmación del usuario. Revalida
// tienda (findFirst acotado a session.storeId), estado y expiración.
export async function confirmProposal(session: Session, proposalId: string) {
  const proposal = await prisma.aiRecommendationHistory.findFirst({
    where: { id: proposalId, storeId: session.storeId }
  });
  if (!proposal || !proposal.type.startsWith("ACTION_")) {
    throw new ProposalError("Propuesta no encontrada.", 404);
  }
  if (proposal.outcomeSuccess !== null) {
    throw new ProposalError("Esta propuesta ya fue procesada.", 409);
  }
  if (Date.now() - proposal.createdAt.getTime() > PROPOSAL_TTL_MS) {
    await prisma.aiRecommendationHistory.update({ where: { id: proposal.id }, data: { outcomeSuccess: false } });
    throw new ProposalError("La propuesta expiró. Genera una nueva.", 410);
  }

  const parsed = JSON.parse(proposal.recommendation) as { payload: unknown };

  if (proposal.type === ACTION_TYPES.CREATE_ANNOUNCEMENT) {
    const payload = announcementPayloadSchema.parse(parsed.payload);
    const announcement = await createAnnouncement(session, payload);
    await prisma.aiRecommendationHistory.update({ where: { id: proposal.id }, data: { outcomeSuccess: true } });
    await recordAudit({
      session,
      action: "ai.action.create_announcement",
      entity: "Announcement",
      entityId: announcement.id,
      storeId: session.storeId,
      detail: `Comunicado creado vía Copilot (confirmado por ${session.role}): ${announcement.title}`
    });
    return { type: proposal.type, result: announcement };
  }

  throw new ProposalError("Tipo de acción no soportado.", 400);
}
