import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession, isApiError, parseJson } from "@/lib/api";
import { serializeEntry } from "@/lib/cycle-count";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const captureSchema = z.object({
  tagId: z.string(),
  pieces: z.number().int().min(0).max(99_999),
  // 1 = conteo físico; 2 = segundo conteo (verificación); 3 = conteo definitivo
  slot: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(1)
});

// POST — capturar piezas de un marbete. Cualquier rol de la tienda cuenta.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  if (isApiError(session)) return session;
  const parsed = await parseJson(request, captureSchema);
  if ("response" in parsed) return parsed.response;
  const body = parsed.data;

  const count = await prisma.cycleCount.findFirst({ where: { id, storeId: session.storeId } });
  if (!count) return NextResponse.json({ error: "Conteo no encontrado." }, { status: 404 });
  if (count.status !== "OPEN") return NextResponse.json({ error: "Este conteo ya está cerrado." }, { status: 409 });

  const tag = await prisma.cycleCountTag.findFirst({ where: { id: body.tagId, storeId: session.storeId, active: true } });
  if (!tag) return NextResponse.json({ error: "Marbete no encontrado." }, { status: 404 });

  const existing = await prisma.cycleCountEntry.findUnique({
    where: { countId_tagId: { countId: id, tagId: tag.id } }
  });

  // Reglas de escalera: el 2do requiere 1er conteo, el 3ro requiere 2do.
  if (body.slot === 2 && (existing?.count1 ?? null) === null) {
    return NextResponse.json({ error: "Ese marbete aún no tiene 1er conteo." }, { status: 400 });
  }
  if (body.slot === 3 && (existing?.count2 ?? null) === null) {
    return NextResponse.json({ error: "Ese marbete aún no tiene 2do conteo." }, { status: 400 });
  }
  // Corregir una captura existente: solo quien la hizo o gerencia.
  const manager = session.role === "GERENTE" || session.role === "SUBGERENTE";
  const slotOwner = body.slot === 1 ? existing?.count1ById : body.slot === 2 ? existing?.count2ById : existing?.count3ById;
  const slotValue = body.slot === 1 ? existing?.count1 : body.slot === 2 ? existing?.count2 : existing?.count3;
  if (slotValue !== null && slotValue !== undefined && slotOwner && slotOwner !== session.userId && !manager) {
    return NextResponse.json({ error: "Ese conteo lo capturó otra persona; solo gerencia puede corregirlo." }, { status: 403 });
  }

  const stamp = {
    [`count${body.slot}`]: body.pieces,
    [`count${body.slot}ById`]: session.userId,
    [`count${body.slot}ByName`]: session.name,
    [`count${body.slot}At`]: new Date()
  };

  const entry = await prisma.cycleCountEntry.upsert({
    where: { countId_tagId: { countId: id, tagId: tag.id } },
    create: { countId: id, tagId: tag.id, ...stamp },
    update: stamp
  });

  // Conteo CIEGO: al asesor se le regresa su avance sin las piezas de los otros
  // conteos (mismo criterio que el GET). manager ya se calculó arriba.
  return NextResponse.json({
    entry: serializeEntry({
      tagId: entry.tagId,
      count1: entry.count1, count1ByName: entry.count1ByName, count1At: entry.count1At?.toISOString() ?? null,
      count2: entry.count2, count2ByName: entry.count2ByName,
      count3: entry.count3, count3ByName: entry.count3ByName
    }, manager)
  });
}
