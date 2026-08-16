import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminCapture } from "@/lib/admin-capture-auth";
import { closeInventoryRound, listInventoryRounds, openInventoryRound } from "@/lib/inventory-kardex";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Rondas de inventario: abrir con un conteo físico y cerrar con el siguiente.
 *
 * Está en su propia ruta a propósito, separada de la captura diaria de
 * movimientos. Registrar un traspaso es rutina; abrir o cerrar una ronda fija la
 * base de la que cuelga toda la existencia teórica. Mezclarlas en un mismo
 * endpoint invitaba a que un formulario mal armado moviera la base sin querer.
 */
const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("open"),
    storeId: z.string().min(1).max(64),
    name: z.string().min(1).max(80),
    startDate: z.string().min(1).max(10),
    basePieces: z.union([z.number(), z.string()]),
    countId: z.string().max(64).nullish(),
    note: z.string().max(500).nullish()
  }),
  z.object({
    action: z.literal("close"),
    storeId: z.string().min(1).max(64),
    endDate: z.string().min(1).max(10),
    countedPieces: z.union([z.number(), z.string()])
  })
]);

export async function GET(request: Request) {
  const unauthorized = requireAdminCapture(request);
  if (unauthorized) return unauthorized;

  const storeId = new URL(request.url).searchParams.get("storeId")?.trim();
  if (!storeId) return NextResponse.json({ error: "Falta storeId." }, { status: 400 });

  const rounds = await listInventoryRounds(storeId);
  return NextResponse.json({
    ok: true,
    rounds: rounds.map((round) => ({
      ...round,
      startDate: round.startDate.toISOString().slice(0, 10),
      endDate: round.endDate ? round.endDate.toISOString().slice(0, 10) : null,
      open: round.closedAt === null
    }))
  });
}

export async function POST(request: Request) {
  const unauthorized = requireAdminCapture(request);
  if (unauthorized) return unauthorized;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo invalido." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Cuerpo invalido.", detail: parsed.error.issues.map((issue) => issue.message) },
      { status: 400 }
    );
  }

  const store = await prisma.store.findUnique({ where: { id: parsed.data.storeId }, select: { id: true } });
  if (!store) return NextResponse.json({ error: "Tienda no encontrada." }, { status: 404 });

  const outcome =
    parsed.data.action === "open"
      ? await openInventoryRound(parsed.data.storeId, {
          name: parsed.data.name,
          startDate: parsed.data.startDate,
          basePieces: parsed.data.basePieces,
          countId: parsed.data.countId,
          note: parsed.data.note
        })
      : await closeInventoryRound(parsed.data.storeId, {
          endDate: parsed.data.endDate,
          countedPieces: parsed.data.countedPieces
        });

  if (!outcome.ok) {
    return NextResponse.json({ error: "No se pudo procesar la ronda.", detail: outcome.errors }, { status: 422 });
  }

  return NextResponse.json({ ok: true, ...outcome.result });
}
