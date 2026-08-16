import { PERSON_WHERE } from "@/lib/store-people";
import {
  countDifference,
  normalizeBaselineEntry,
  normalizeMovementEntry,
  summarizeKardex,
  type BaselineEntry,
  type InventoryMovementType,
  type KardexSummary,
  type MovementEntry,
  type NormalizedMovement
} from "@/lib/inventory-kardex-entry";
import { prisma } from "@/lib/prisma";

/**
 * Kardex de inventario: lectura del estado y escritura de movimientos.
 *
 * La validación pura vive en `lib/inventory-kardex-entry` —ese módulo no importa
 * Prisma y es el que cubren las pruebas—. Aquí solo queda lo que toca la base.
 */

/** Medianoche UTC de hoy: las fechas del kardex son días, no instantes. */
function todayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export type KardexState = {
  baseline: { date: Date; pieces: number; countId: string | null; note: string | null } | null;
  summary: KardexSummary | null;
  movements: {
    id: string;
    date: Date;
    type: InventoryMovementType;
    quantity: number;
    reference: string | null;
    counterpart: string | null;
    note: string | null;
    createdBy: string | null;
  }[];
};

/**
 * Estado del kardex de una tienda.
 *
 * Sin inventario inicial no hay teórico posible: se devuelve `summary: null` en
 * vez de un cero, porque un cero se leería como «no hay mercancía» cuando lo que
 * pasa es que el kardex aún no ha arrancado.
 */
export async function getKardexState(storeId: string): Promise<KardexState> {
  const baseline = await prisma.inventoryBaseline.findUnique({
    where: { storeId },
    select: { date: true, pieces: true, countId: true, note: true }
  });

  if (!baseline) return { baseline: null, summary: null, movements: [] };

  const [movements, sold] = await Promise.all([
    prisma.inventoryMovement.findMany({
      where: { storeId },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        date: true,
        type: true,
        quantity: true,
        reference: true,
        counterpart: true,
        note: true,
        createdBy: true
      }
    }),
    // Las piezas VENDIDAS no son movimientos capturados: ya se registran en KPIs
    // día a día. `PERSON_WHERE` excluye al usuario del kiosko, que está dado de
    // alta como ASESOR y contaría como una persona más — ver `lib/store-people`.
    prisma.kpi.aggregate({
      where: { storeId, date: { gt: baseline.date }, user: PERSON_WHERE },
      _sum: { pieces: true }
    })
  ]);

  const summary = summarizeKardex({
    baselinePieces: baseline.pieces,
    soldPieces: sold._sum.pieces ?? 0,
    movements: movements.map((movement) => ({
      type: movement.type as InventoryMovementType,
      quantity: movement.quantity
    }))
  });

  return {
    baseline,
    summary,
    movements: movements.map((movement) => ({ ...movement, type: movement.type as InventoryMovementType }))
  };
}

export type CaptureOutcome<T> = { ok: true; result: T } | { ok: false; errors: string[] };

/**
 * Registra movimientos del kardex.
 *
 * Es todo o nada: si una fila no valida, no se escribe ninguna. Con capturas de
 * varias filas, dejar entrar las buenas y rechazar las malas obliga a adivinar
 * cuáles quedaron dentro, y en un kardex esa duda se paga recontando.
 */
export async function captureInventoryMovements(
  storeId: string,
  entries: MovementEntry[]
): Promise<CaptureOutcome<{ created: number }>> {
  const baseline = await prisma.inventoryBaseline.findUnique({
    where: { storeId },
    select: { date: true }
  });
  if (!baseline) {
    return {
      ok: false,
      errors: ["Esta tienda todavía no tiene inventario inicial. Sin base no hay teórico contra el cual medir nada."]
    };
  }

  const today = todayUtc();
  const errors: string[] = [];
  const normalized: NormalizedMovement[] = [];
  for (const entry of entries) {
    const outcome = normalizeMovementEntry(entry, { baselineDate: baseline.date, today });
    if (!outcome.ok) errors.push(outcome.error);
    else normalized.push(outcome.value);
  }
  if (errors.length > 0) return { ok: false, errors };

  await prisma.inventoryMovement.createMany({
    data: normalized.map((movement) => ({ storeId, ...movement }))
  });

  return { ok: true, result: { created: normalized.length } };
}

/**
 * Fija el inventario inicial de una tienda.
 *
 * ⚠️ **No se reemplaza sin pedirlo explícitamente.** La base es el único número
 * del que cuelga todo el kardex: cambiarla reescribe la existencia teórica de
 * todos los días anteriores de golpe. Que cueste un paso extra es el punto.
 */
export async function setInventoryBaseline(
  storeId: string,
  entry: BaselineEntry,
  { allowReplace = false }: { allowReplace?: boolean } = {}
): Promise<CaptureOutcome<{ replaced: boolean; pieces: number }>> {
  const outcome = normalizeBaselineEntry(entry, { today: todayUtc() });
  if (!outcome.ok) return { ok: false, errors: [outcome.error] };

  const existing = await prisma.inventoryBaseline.findUnique({
    where: { storeId },
    select: { pieces: true, date: true }
  });

  if (existing && !allowReplace) {
    return {
      ok: false,
      errors: [
        `Esta tienda ya tiene inventario inicial: ${existing.pieces} piezas del ${existing.date.toISOString().slice(0, 10)}. Reemplazarlo recalcula todo el histórico; hay que pedirlo expresamente.`
      ]
    };
  }

  // Cambiar la base sin revisar los movimientos dejaría movimientos anteriores a
  // ella, que ya estarían contados dentro de las piezas nuevas y sumarían dos veces.
  if (existing && allowReplace) {
    const stragglers = await prisma.inventoryMovement.count({
      where: { storeId, date: { lte: outcome.value.date } }
    });
    if (stragglers > 0) {
      return {
        ok: false,
        errors: [
          `Hay ${stragglers} movimiento(s) en o antes del ${outcome.value.date.toISOString().slice(0, 10)}. Con la base nueva quedarían contados dos veces: revísalos antes de reemplazarla.`
        ]
      };
    }
  }

  const data = {
    date: outcome.value.date,
    pieces: outcome.value.pieces,
    countId: outcome.value.countId,
    note: outcome.value.note
  };
  await prisma.inventoryBaseline.upsert({
    where: { storeId },
    create: { storeId, ...data },
    update: data
  });

  return { ok: true, result: { replaced: Boolean(existing), pieces: outcome.value.pieces } };
}

/**
 * Diferencia de un conteo físico contra el teórico de hoy.
 *
 * Es **acumulada desde el inventario inicial**: la base no se reancla en cada
 * conteo. Ver el comentario de `InventoryBaseline` en el esquema.
 */
export async function compareCountAgainstKardex(
  storeId: string,
  countedPieces: number
): Promise<{ theoretical: number; counted: number; difference: number } | null> {
  const state = await getKardexState(storeId);
  if (!state.summary) return null;
  return {
    theoretical: state.summary.theoretical,
    counted: countedPieces,
    difference: countDifference(countedPieces, state.summary.theoretical)
  };
}
