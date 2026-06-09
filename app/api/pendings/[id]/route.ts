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
    return updated;
  });
  if (parsed.data.ownerId && parsed.data.ownerId !== current.ownerId) {
    dispatchPushToUsers([parsed.data.ownerId], { title: "Pendiente reasignado", body: item.title, tag: "pendiente-reasignado" }).catch(() => undefined);
  }
  return NextResponse.json({ pending: serializePending(item) });
}
