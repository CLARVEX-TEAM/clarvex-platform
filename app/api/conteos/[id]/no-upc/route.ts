import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession, isApiError, parseJson } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const addSchema = z.object({
  concept: z.string().trim().min(1).max(80),
  pieces: z.number().int().min(0).max(99_999)
});

// POST — agregar renglón de "Piezas Sin UPC" (gerencia).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession(["GERENTE", "SUBGERENTE"]);
  if (isApiError(session)) return session;
  const parsed = await parseJson(request, addSchema);
  if ("response" in parsed) return parsed.response;
  const body = parsed.data;

  const count = await prisma.cycleCount.findFirst({ where: { id, storeId: session.storeId } });
  if (!count) return NextResponse.json({ error: "Conteo no encontrado." }, { status: 404 });
  if (count.status !== "OPEN") return NextResponse.json({ error: "Este conteo ya está cerrado." }, { status: 409 });

  const item = await prisma.cycleCountNoUpc.create({
    data: { countId: id, concept: body.concept, pieces: body.pieces }
  });
  return NextResponse.json({ item: { id: item.id, concept: item.concept, pieces: item.pieces } }, { status: 201 });
}

// DELETE — quitar un renglón. Body: { itemId }
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession(["GERENTE", "SUBGERENTE"]);
  if (isApiError(session)) return session;
  const body = (await request.json().catch(() => ({}))) as { itemId?: string };
  if (!body.itemId) return NextResponse.json({ error: "Falta el renglón." }, { status: 400 });

  await prisma.cycleCountNoUpc.deleteMany({ where: { id: body.itemId, countId: id, count: { storeId: session.storeId } } });
  return NextResponse.json({ ok: true });
}
