import type { prisma } from "@/lib/prisma";
type PrismaClient = typeof prisma;
import type { Session } from "@/lib/session-token";
import { validateProfilePhoto } from "@/lib/profile-photo";

export const EVIDENCE_MAX_BYTES = 5 * 1024 * 1024;
export type ResourceTarget = { pendingId?: string; taskId?: string; logEntryId?: string; announcementId?: string };
type ResourceClient = Pick<PrismaClient, "pending" | "dayPlanTask" | "storeLog" | "announcement">;

export function validateEvidenceImage(file: { type: string; size: number }, bytes: Uint8Array) {
  return validateProfilePhoto(file, bytes);
}

export function parseResourceTarget(values: ResourceTarget) {
  const target = {
    pendingId: values.pendingId?.trim() || undefined,
    taskId: values.taskId?.trim() || undefined,
    logEntryId: values.logEntryId?.trim() || undefined,
    announcementId: values.announcementId?.trim() || undefined
  };
  if (Object.values(target).filter(Boolean).length !== 1) return null;
  return target;
}

export async function authorizeResource(client: ResourceClient, session: Session, target: ResourceTarget) {
  const manager = session.role === "GERENTE" || session.role === "SUBGERENTE";
  if (target.pendingId) {
    const pending = await client.pending.findFirst({ where: { id: target.pendingId, storeId: session.storeId }, select: { id: true, title: true, ownerId: true } });
    if (!pending || (!manager && pending.ownerId !== session.userId)) return null;
    return { kind: "pending" as const, title: pending.title, recipientId: pending.ownerId };
  }
  if (target.taskId) {
    const task = await client.dayPlanTask.findFirst({ where: { id: target.taskId, plan: { storeId: session.storeId } }, select: { id: true, title: true, plan: { select: { userId: true } } } });
    if (!task || (!manager && task.plan.userId !== session.userId)) return null;
    return { kind: "task" as const, title: task.title, recipientId: task.plan.userId };
  }
  if (target.logEntryId) {
    const log = await client.storeLog.findFirst({ where: { id: target.logEntryId, storeId: session.storeId }, select: { id: true, description: true, authorId: true } });
    if (!log || !manager) return null;
    return { kind: "logEntry" as const, title: log.description.slice(0, 80), recipientId: log.authorId };
  }
  if (target.announcementId) {
    // Cualquier integrante de la tienda puede comentar un comunicado.
    const announcement = await client.announcement.findFirst({ where: { id: target.announcementId, storeId: session.storeId }, select: { id: true, title: true, authorId: true } });
    if (!announcement) return null;
    return { kind: "announcement" as const, title: announcement.title, recipientId: announcement.authorId };
  }
  return null;
}

export function targetWhere(target: ResourceTarget) {
  if (target.pendingId) return { pendingId: target.pendingId };
  if (target.taskId) return { taskId: target.taskId };
  if (target.logEntryId) return { logEntryId: target.logEntryId };
  return { announcementId: target.announcementId! };
}
