import { NextResponse } from "next/server";
import { z } from "zod";
import { isApiError, parseJson, requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { pendingInput, serializePending } from "@/lib/pending";
import { createNotifications } from "@/lib/notifications";
import { dispatchPushToUsers } from "@/lib/push";
import { retirarAvisosDelPendiente } from "@/lib/pendiente-cierre";

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
  const { dueDate, cursos, tipo, ...data } = parsed.data;
  const esCurso = (tipo ?? current.tipo) === "CURSO";
  if (tipo === "CURSO" && cursos !== undefined && cursos.length === 0) {
    return NextResponse.json({ error: "Un curso necesita al menos un curso en su matriz." }, { status: 400 });
  }
  const item = await prisma.$transaction(async (tx) => {
    // Cambiar el estatus a mano resuelve cualquier petición de cierre por
    // WhatsApp: gerencia ya decidió desde la app.
    const updated = await tx.pending.update({
      where: { id: current.id },
      data: {
        ...data,
        ...(tipo ? { tipo } : {}),
        ...(dueDate ? { dueDate: new Date(`${dueDate}T12:00:00.000Z`) } : {}),
        ...(data.status ? { cierreSolicitadoAt: null } : {})
      }
    });
    // La lista de la matriz se sincroniza por POSICIÓN: renombrar no pierde el
    // avance, y un curso ya completado nunca se borra al quitarlo de la lista.
    if (esCurso && cursos) {
      const existentes = await tx.pendingCurso.findMany({ where: { pendingId: current.id } });
      for (const [i, nombre] of cursos.entries()) {
        const previo = existentes.find((c) => c.orden === i + 1);
        if (!previo) await tx.pendingCurso.create({ data: { pendingId: current.id, orden: i + 1, nombre } });
        else if (previo.nombre !== nombre) await tx.pendingCurso.update({ where: { id: previo.id }, data: { nombre } });
      }
      await tx.pendingCurso.deleteMany({ where: { pendingId: current.id, orden: { gt: cursos.length }, completadoAt: null } });
    }
    if (parsed.data.ownerId && parsed.data.ownerId !== current.ownerId) {
      await createNotifications(tx, [{
        storeId: session.storeId,
        userId: parsed.data.ownerId,
        type: "PENDING_ASSIGNED",
        title: "Pendiente reasignado",
        body: updated.title
      }]);
    }

    if (updated.status === "COMPLETADO") await retirarAvisosDelPendiente(tx, session.storeId, updated);

    return updated;
  });
  if (parsed.data.ownerId && parsed.data.ownerId !== current.ownerId) {
    dispatchPushToUsers([parsed.data.ownerId], { title: "Pendiente reasignado", body: item.title, tag: "pendiente-reasignado", url: "/pendientes" }).catch(() => undefined);
  }
  const conCursos = await prisma.pending.findUnique({ where: { id: item.id }, include: { cursos: true } });
  return NextResponse.json({ pending: serializePending(conCursos ?? item) });
}
