import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformAdmin, requireSession, isApiError, parseJson } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { serializeEntry } from "@/lib/cycle-count";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET — detalle del conteo: marbetes + capturas (todos los roles).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  if (isApiError(session)) return session;

  const count = await prisma.cycleCount.findFirst({
    where: { id, storeId: session.storeId },
    include: {
      entries: true,
      noUpcItems: { orderBy: { concept: "asc" } }
    }
  });
  if (!count) return NextResponse.json({ error: "Conteo no encontrado." }, { status: 404 });

  // La lista de marbetes sale del CATALOGO de la tienda, no de una foto por
  // conteo. Como ahora se pueden agregar marbetes con el conteo abierto, uno
  // YA CERRADO se llenaria de marbetes que no existian cuando se conto: se
  // verian como pendientes y le bajarian el avance a un resultado ya
  // entregado. Cerrado, solo se ven los que existian mientras estuvo abierto.
  const tags = await prisma.cycleCountTag.findMany({
    where: {
      storeId: session.storeId,
      active: true,
      ...(count.closedAt ? { createdAt: { lte: count.closedAt } } : {})
    },
    orderBy: [{ zone: "asc" }, { number: "asc" }]
  });

  // Conteo CIEGO: solo gerencia/subgerencia ve las piezas capturadas. El asesor
  // ve su avance (qué conteo va) pero no lo que contó otra persona, para que un
  // 2do/3er conteo no copie al anterior.
  const canSeePieces = session.role === "GERENTE" || session.role === "SUBGERENTE";

  return NextResponse.json({
    count: {
      id: count.id,
      date: count.date.toISOString().slice(0, 10),
      status: count.status,
      // El teórico (Kardex) y los faltantes sin UPC son datos de gerencia.
      theoretical: canSeePieces ? count.theoretical : null,
      notes: count.notes,
      noUpcItems: canSeePieces ? count.noUpcItems.map((item) => ({ id: item.id, concept: item.concept, pieces: item.pieces })) : []
    },
    canSeePieces,
    tags: tags.map((tag) => ({ id: tag.id, number: tag.number, zone: tag.zone, label: tag.label })),
    entries: count.entries.map((entry) => serializeEntry({
      tagId: entry.tagId,
      count1: entry.count1, count1ByName: entry.count1ByName, count1At: entry.count1At?.toISOString() ?? null, count1ById: entry.count1ById,
      count2: entry.count2, count2ByName: entry.count2ByName, count2ById: entry.count2ById,
      count3: entry.count3, count3ByName: entry.count3ByName, count3ById: entry.count3ById
    }, canSeePieces, session.userId))
  });
}

const patchSchema = z.object({
  status: z.enum(["OPEN", "CLOSED"]).optional(),
  theoretical: z.number().int().min(0).max(9_999_999).nullable().optional(),
  notes: z.string().max(300).nullable().optional()
});

// PATCH — gerencia cierra/reabre o ajusta teórico y notas.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession(["GERENTE", "SUBGERENTE"]);
  if (isApiError(session)) return session;
  const parsed = await parseJson(request, patchSchema);
  if ("response" in parsed) return parsed.response;
  const body = parsed.data;

  const count = await prisma.cycleCount.findFirst({ where: { id, storeId: session.storeId } });
  if (!count) return NextResponse.json({ error: "Conteo no encontrado." }, { status: 404 });

  const updated = await prisma.cycleCount.update({
    where: { id },
    data: {
      ...(body.status ? { status: body.status, closedAt: body.status === "CLOSED" ? new Date() : null } : {}),
      ...(body.theoretical !== undefined ? { theoretical: body.theoretical } : {}),
      ...(body.notes !== undefined ? { notes: body.notes?.trim() || null } : {})
    }
  });

  if (body.status && body.status !== count.status) {
    await recordAudit({
      session,
      storeId: session.storeId,
      action: body.status === "CLOSED" ? "cyclecount.close" : "cyclecount.reopen",
      entity: "CycleCount",
      entityId: id,
      detail: `Conteo del ${count.date.toISOString().slice(0, 10)} ${body.status === "CLOSED" ? "cerrado" : "reabierto"}`
    });
  }

  return NextResponse.json({ ok: true, status: updated.status });
}

// DELETE — solo el administrador de plataforma elimina conteos (con sus
// capturas): un conteo es evidencia de inventario, no debe borrarse a la ligera.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requirePlatformAdmin();
  if (isApiError(session)) return session;

  // El admin de plataforma puede depurar conteos de cualquier tienda.
  const count = await prisma.cycleCount.findFirst({ where: { id } });
  if (!count) return NextResponse.json({ error: "Conteo no encontrado." }, { status: 404 });

  await prisma.cycleCount.delete({ where: { id } });
  await recordAudit({
    session,
    storeId: session.storeId,
    action: "cyclecount.delete",
    entity: "CycleCount",
    entityId: id,
    detail: `Conteo del ${count.date.toISOString().slice(0, 10)} eliminado`
  });
  return NextResponse.json({ ok: true });
}
