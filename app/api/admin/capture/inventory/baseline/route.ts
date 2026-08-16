import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminCapture } from "@/lib/admin-capture-auth";
import { setInventoryBaseline } from "@/lib/inventory-kardex";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Fija el inventario inicial de una tienda: el único número del kardex que no se
 * deriva de nada.
 *
 * Está en su propia ruta a propósito, separada de la captura diaria de
 * movimientos. Registrar un traspaso es rutina; cambiar la base recalcula la
 * existencia teórica de todos los días de golpe. Mezclarlas en un mismo endpoint
 * invitaba a que un formulario mal armado reescribiera la base sin querer.
 *
 * `replace: true` es explícito y además exige que no queden movimientos
 * anteriores a la fecha nueva — ver `setInventoryBaseline`.
 */
const bodySchema = z.object({
  storeId: z.string().min(1).max(64),
  date: z.string().min(1).max(10),
  pieces: z.union([z.number(), z.string()]),
  countId: z.string().max(64).nullish(),
  note: z.string().max(500).nullish(),
  replace: z.boolean().optional()
});

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

  const outcome = await setInventoryBaseline(
    parsed.data.storeId,
    {
      date: parsed.data.date,
      pieces: parsed.data.pieces,
      countId: parsed.data.countId,
      note: parsed.data.note
    },
    { allowReplace: parsed.data.replace === true }
  );

  if (!outcome.ok) {
    return NextResponse.json({ error: "No se pudo fijar el inventario inicial.", detail: outcome.errors }, { status: 422 });
  }

  return NextResponse.json({ ok: true, ...outcome.result });
}
