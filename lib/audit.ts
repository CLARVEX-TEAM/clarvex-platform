import { prisma } from "@/lib/prisma";
import type { Session } from "@/lib/session-token";

// Registro de auditoría de acciones sensibles. NUNCA lanza: si la escritura
// falla, la operación principal no debe romperse por el registro.

export type AuditInput = {
  session: Pick<Session, "userId" | "name">;
  action: string;       // p.ej. "commission.update"
  entity: string;       // p.ej. "CommissionRule"
  entityId?: string | null;
  storeId?: string | null;
  storeName?: string | null;
  detail?: string | null;
};

export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        storeId: input.storeId ?? null,
        storeName: input.storeName ?? null,
        actorId: input.session.userId,
        actorName: input.session.name,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        detail: input.detail ? input.detail.slice(0, 1000) : null
      }
    });
  } catch (cause) {
    console.error("recordAudit:", cause);
  }
}
