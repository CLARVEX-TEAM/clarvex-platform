import {
  countDifference,
  normalizeMovementEntry,
  normalizeRoundEntry,
  summarizeKardex,
  validatePieces,
  type InventoryMovementType,
  type KardexSummary,
  type MovementEntry,
  type NormalizedMovement,
  type RoundEntry
} from "@/lib/inventory-kardex-entry";
import { prisma } from "@/lib/prisma";
import { PERSON_WHERE } from "@/lib/store-people";

/**
 * Kardex de inventario: rondas, movimientos y existencia teórica.
 *
 * La validación pura vive en `lib/inventory-kardex-entry` —ese módulo no importa
 * Prisma y es el que cubren las pruebas—. Aquí solo queda lo que toca la base.
 */

/** Medianoche UTC de hoy: las fechas del kardex son días, no instantes. */
function todayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export type CaptureOutcome<T> = { ok: true; result: T } | { ok: false; errors: string[] };

export type KardexRound = {
  id: string;
  name: string;
  startDate: Date;
  basePieces: number;
  endDate: Date | null;
  closingPieces: number | null;
  note: string | null;
};

export type KardexState = {
  round: KardexRound | null;
  summary: KardexSummary | null;
  /** Diferencia contra el conteo de cierre. `null` mientras la ronda siga abierta. */
  difference: number | null;
  movements: {
    id: string;
    date: Date;
    type: InventoryMovementType;
    quantity: number;
    reference: string | null;
    document: string | null;
    delivery: string | null;
    counterpart: string | null;
    surplus: number | null;
    missing: number | null;
    note: string | null;
    createdBy: string | null;
  }[];
};

/** La ronda abierta de la tienda, o `null` si no hay ninguna. */
export async function getOpenRound(storeId: string) {
  return prisma.inventoryRound.findFirst({
    where: { storeId, closedAt: null },
    orderBy: { startDate: "desc" }
  });
}

/**
 * Estado del kardex de una ronda. Sin `roundId` se usa la abierta.
 *
 * Sin ronda no hay teórico posible: se devuelve `summary: null` en vez de un
 * cero, porque un cero se leería como «no hay mercancía» cuando lo que pasa es
 * que el kardex aún no ha arrancado.
 */
export async function getKardexState(storeId: string, roundId?: string): Promise<KardexState> {
  const round = roundId
    ? await prisma.inventoryRound.findFirst({ where: { id: roundId, storeId } })
    : await getOpenRound(storeId);

  if (!round) return { round: null, summary: null, difference: null, movements: [] };

  const [movements, sold] = await Promise.all([
    prisma.inventoryMovement.findMany({
      where: { roundId: round.id },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }]
    }),
    // Las piezas VENDIDAS no son movimientos capturados: ya se registran en KPIs
    // día a día. Mismo corte que los movimientos (`> startDate`) para que lo del
    // día del inventario no cuente dos veces. `PERSON_WHERE` excluye al usuario
    // del kiosko, que está dado de alta como ASESOR — ver `lib/store-people`.
    prisma.kpi.aggregate({
      where: {
        storeId,
        date: { gt: round.startDate, ...(round.endDate ? { lte: round.endDate } : {}) },
        user: PERSON_WHERE
      },
      _sum: { pieces: true }
    })
  ]);

  const summary = summarizeKardex({
    basePieces: round.basePieces,
    soldPieces: sold._sum.pieces ?? 0,
    movements: movements.map((movement) => ({
      type: movement.type as InventoryMovementType,
      quantity: movement.quantity
    }))
  });

  return {
    round: {
      id: round.id,
      name: round.name,
      startDate: round.startDate,
      basePieces: round.basePieces,
      endDate: round.endDate,
      closingPieces: round.closingPieces,
      note: round.note
    },
    summary,
    difference:
      round.closingPieces === null ? null : countDifference(round.closingPieces, summary.theoretical),
    movements: movements.map((movement) => ({
      id: movement.id,
      date: movement.date,
      type: movement.type as InventoryMovementType,
      quantity: movement.quantity,
      reference: movement.reference,
      document: movement.document,
      delivery: movement.delivery,
      counterpart: movement.counterpart,
      surplus: movement.surplus,
      missing: movement.missing,
      note: movement.note,
      createdBy: movement.createdBy
    }))
  };
}

/**
 * Registra movimientos en la ronda abierta.
 *
 * Es todo o nada: si una fila no valida, no se escribe ninguna. Con capturas de
 * varias filas, dejar entrar las buenas y rechazar las malas obliga a adivinar
 * cuáles quedaron dentro, y en un kardex esa duda se paga recontando.
 */
export async function captureInventoryMovements(
  storeId: string,
  entries: MovementEntry[]
): Promise<CaptureOutcome<{ created: number }>> {
  const round = await getOpenRound(storeId);
  if (!round) {
    return {
      ok: false,
      errors: ["Esta tienda no tiene una ronda abierta. Abre una con el inventario más reciente antes de capturar movimientos."]
    };
  }

  const today = todayUtc();
  const errors: string[] = [];
  const normalized: NormalizedMovement[] = [];
  for (const entry of entries) {
    const outcome = normalizeMovementEntry(entry, {
      round: { start: round.startDate, end: round.endDate },
      today
    });
    if (!outcome.ok) errors.push(outcome.error);
    else normalized.push(outcome.value);
  }
  if (errors.length > 0) return { ok: false, errors };

  await prisma.inventoryMovement.createMany({
    data: normalized.map((movement) => ({ storeId, roundId: round.id, ...movement }))
  });

  return { ok: true, result: { created: normalized.length } };
}

/**
 * Abre una ronda de inventario.
 *
 * Solo puede haber una abierta por tienda: la anterior tiene que cerrarse antes.
 * Lo garantiza también un índice único parcial en la base, para que dos capturas
 * simultáneas no puedan colar dos rondas abiertas y partir el kardex en dos.
 */
export async function openInventoryRound(
  storeId: string,
  entry: RoundEntry
): Promise<CaptureOutcome<{ roundId: string; basePieces: number }>> {
  const outcome = normalizeRoundEntry(entry, { today: todayUtc() });
  if (!outcome.ok) return { ok: false, errors: [outcome.error] };

  const open = await getOpenRound(storeId);
  if (open) {
    return {
      ok: false,
      errors: [
        `Ya hay una ronda abierta: «${open.name}», desde el ${open.startDate.toISOString().slice(0, 10)}. Ciérrala con su conteo físico antes de abrir la siguiente.`
      ]
    };
  }

  // Una ronda nueva que empiece antes de donde terminó la anterior solaparía dos
  // kardex sobre los mismos días.
  const previous = await prisma.inventoryRound.findFirst({
    where: { storeId },
    orderBy: { startDate: "desc" },
    select: { name: true, endDate: true }
  });
  if (previous?.endDate && outcome.value.startDate.getTime() < previous.endDate.getTime()) {
    return {
      ok: false,
      errors: [
        `La ronda anterior («${previous.name}») cerró el ${previous.endDate.toISOString().slice(0, 10)}. La nueva no puede empezar antes.`
      ]
    };
  }

  const round = await prisma.inventoryRound.create({
    data: { storeId, ...outcome.value },
    select: { id: true, basePieces: true }
  });
  return { ok: true, result: { roundId: round.id, basePieces: round.basePieces } };
}

/**
 * Cierra la ronda abierta con el conteo físico y devuelve la diferencia.
 *
 * ⚠️ **No abre la siguiente automáticamente.** Encadenarlas parece cómodo, pero
 * el conteo de cierre suele ajustarse en los días posteriores al inventario;
 * abrir la ronda nueva de golpe dejaría su base clavada en una cifra provisional.
 */
export async function closeInventoryRound(
  storeId: string,
  { endDate, countedPieces }: { endDate: string; countedPieces: number | string }
): Promise<CaptureOutcome<{ theoretical: number; counted: number; difference: number }>> {
  const round = await getOpenRound(storeId);
  if (!round) return { ok: false, errors: ["Esta tienda no tiene ninguna ronda abierta que cerrar."] };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate ?? "")) {
    return { ok: false, errors: [`Fecha inválida (${String(endDate)}), se espera AAAA-MM-DD.`] };
  }
  const end = new Date(`${endDate}T00:00:00.000Z`);
  if (Number.isNaN(end.getTime()) || end.toISOString().slice(0, 10) !== endDate) {
    return { ok: false, errors: [`Fecha inexistente (${endDate}).`] };
  }
  if (end.getTime() <= round.startDate.getTime()) {
    return {
      ok: false,
      errors: [`El cierre (${endDate}) tiene que ser posterior a la apertura (${round.startDate.toISOString().slice(0, 10)}).`]
    };
  }
  if (end.getTime() > todayUtc().getTime()) {
    return { ok: false, errors: [`${endDate}: no se puede cerrar una ronda en el futuro.`] };
  }

  const counted = validatePieces(countedPieces, "El conteo de cierre");
  if (typeof counted === "string") return { ok: false, errors: [counted] };

  // Movimientos posteriores al cierre quedarían fuera del teórico contra el que
  // se compara, y la diferencia saldría mal sin que nada lo indique.
  const stragglers = await prisma.inventoryMovement.count({
    where: { roundId: round.id, date: { gt: end } }
  });
  if (stragglers > 0) {
    return {
      ok: false,
      errors: [`Hay ${stragglers} movimiento(s) posteriores al ${endDate}. Revísalos: o la fecha de cierre es otra, o van en la ronda siguiente.`]
    };
  }

  await prisma.inventoryRound.update({
    where: { id: round.id },
    data: { endDate: end, closingPieces: counted, closedAt: new Date() }
  });

  const state = await getKardexState(storeId, round.id);
  const theoretical = state.summary?.theoretical ?? 0;
  return { ok: true, result: { theoretical, counted, difference: countDifference(counted, theoretical) } };
}

/** Historial de rondas de la tienda, la más reciente primero. */
export async function listInventoryRounds(storeId: string) {
  return prisma.inventoryRound.findMany({
    where: { storeId },
    orderBy: { startDate: "desc" },
    select: {
      id: true,
      name: true,
      startDate: true,
      basePieces: true,
      endDate: true,
      closingPieces: true,
      closedAt: true
    }
  });
}
