import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminCapture } from "@/lib/admin-capture-auth";
import { captureInventoryMovements, getKardexState } from "@/lib/inventory-kardex";
import { counterpartOptions } from "@/lib/inventory-counterparts";
import { MOVEMENT_TYPES, movementLabel } from "@/lib/inventory-kardex-entry";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Kardex de inventario, capturado desde el panel externo (Retool), sin sesión.
 *
 * `GET` devuelve el estado —inventario inicial, desglose y movimientos— y `POST`
 * registra movimientos nuevos. La existencia teórica NUNCA se guarda: se calcula
 * en cada lectura desde la base más los movimientos, así no puede quedar
 * desincronizada de las filas que la justifican.
 *
 * Las **ventas del día no se capturan aquí**: salen de las piezas que ya se
 * registran en KPIs. Ver `lib/inventory-kardex-entry`.
 */
const bodySchema = z.object({
  storeId: z.string().min(1).max(64),
  entries: z
    .array(
      z.object({
        date: z.string().min(1).max(10),
        type: z.string().min(1).max(32),
        quantity: z.union([z.number(), z.string()]),
        reference: z.string().max(64).nullish(),
        document: z.string().max(64).nullish(),
        delivery: z.string().max(64).nullish(),
        counterpart: z.string().max(120).nullish(),
        counterpartCode: z.string().max(16).nullish(),
        surplus: z.union([z.number(), z.string()]).nullish(),
        missing: z.union([z.number(), z.string()]).nullish(),
        note: z.string().max(500).nullish(),
        createdBy: z.string().max(64).nullish()
      })
    )
    .min(1, "No se recibió ningún movimiento.")
    .max(200)
});

export async function GET(request: Request) {
  const unauthorized = requireAdminCapture(request);
  if (unauthorized) return unauthorized;

  const storeId = new URL(request.url).searchParams.get("storeId")?.trim();
  if (!storeId) return NextResponse.json({ error: "Falta storeId." }, { status: 400 });

  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { id: true, name: true } });
  if (!store) return NextResponse.json({ error: "Tienda no encontrada." }, { status: 404 });

  const roundId = new URL(request.url).searchParams.get("roundId")?.trim() || undefined;
  const state = await getKardexState(storeId, roundId);

  return NextResponse.json({
    ok: true,
    store: { id: store.id, name: store.name },
    // El catálogo viaja con el estado para que el formulario externo no tenga que
    // repetir la lista de tipos: si aquí se añade uno, allá aparece solo.
    types: MOVEMENT_TYPES.map((type) => ({ value: type, label: movementLabel(type) })),
    // Las 72 tiendas del catálogo más CEDIS y Uniformes, con los habituales
    // primero. Viaja con el estado para que el formulario externo no mantenga su
    // propia copia y se desincronice.
    counterparts: counterpartOptions(),
    round: state.round
      ? {
          ...state.round,
          startDate: state.round.startDate.toISOString().slice(0, 10),
          endDate: state.round.endDate ? state.round.endDate.toISOString().slice(0, 10) : null,
          open: state.round.endDate === null
        }
      : null,
    summary: state.summary,
    difference: state.difference,
    movements: state.movements.map((movement) => ({
      ...movement,
      date: movement.date.toISOString().slice(0, 10),
      label: movementLabel(movement.type)
    })),
    // El libro completo, ya con signo y con la venta del día incluida. Va
    // aparte de `movements` porque trae filas DERIVADAS que no se pueden
    // editar ni borrar: no existe una fila detrás de ellas.
    ledger: state.ledger
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

  const outcome = await captureInventoryMovements(parsed.data.storeId, parsed.data.entries);
  if (!outcome.ok) {
    return NextResponse.json({ error: "Hay movimientos invalidos.", detail: outcome.errors }, { status: 422 });
  }

  const state = await getKardexState(parsed.data.storeId);
  return NextResponse.json({ ok: true, ...outcome.result, summary: state.summary });
}
