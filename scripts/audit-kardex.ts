/**
 * Auditoría del kardex: que las piezas cuadren y que no haya movimientos
 * imposibles.
 *
 * Uso (VPS):
 *   cd /root/clarvex-app && pnpm exec tsx scripts/audit-kardex.ts
 *
 * Sale con código 1 si encuentra algo. Con 0 y en silencio si todo está bien,
 * para que en el cron solo hable cuando haya que mirarlo.
 *
 * ⚠️ El teórico se recalcula **por un camino distinto** al de la app y después
 * se comparan. Reutilizar `summarizeKardex` no probaría nada: si esa función
 * tuviera un fallo, la auditoría lo repetiría y daría el visto bueno. Aquí los
 * signos se aplican a mano, a partir de los totales por tipo que devuelve la
 * base, y solo al final se contrasta con lo que la app enseña.
 *
 * Por qué existe: un kardex no se equivoca «un poquito». El error se incrusta en
 * la base de la siguiente ronda y desde ahí contamina todo lo que venga.
 */
import { getKardexState } from "@/lib/inventory-kardex";
import { prisma } from "@/lib/prisma";
import { PERSON_WHERE } from "@/lib/store-people";

/** Entradas y salidas, con el signo que les toca. Escrito aparte a propósito. */
const ENTRADAS = ["RECEPCION", "TRANSFERENCIA_ENTRADA", "DEVOLUCION_CLIENTE", "AJUSTE_POSITIVO"];
const SALIDAS = ["TRANSFERENCIA_SALIDA", "SFS", "AJUSTE_NEGATIVO"];

const problems: string[] = [];

function report(store: string, problem: string) {
  problems.push(`[${store}] ${problem}`);
}

/** Hoy en hora de la tienda: en UTC, después de las 18:00 ya sería mañana. */
function todayLocal(): Date {
  const key = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
  return new Date(`${key}T00:00:00.000Z`);
}

async function auditStore(storeId: string, storeName: string) {
  const round = await prisma.inventoryRound.findFirst({
    where: { storeId },
    orderBy: { startDate: "desc" }
  });
  if (!round) return;

  // ── Recuento independiente ────────────────────────────────────────────────
  const byType = await prisma.inventoryMovement.groupBy({
    by: ["type"],
    where: { roundId: round.id },
    _sum: { quantity: true }
  });

  let entradas = 0;
  let salidas = 0;
  for (const row of byType) {
    const pieces = row._sum.quantity ?? 0;
    if (ENTRADAS.includes(row.type)) entradas += pieces;
    else if (SALIDAS.includes(row.type)) salidas += pieces;
    else report(storeName, `tipo de movimiento desconocido: ${row.type}`);
  }

  const sold = await prisma.kpi.aggregate({
    where: {
      storeId,
      date: { gte: round.startDate, ...(round.endDate ? { lte: round.endDate } : {}) },
      user: PERSON_WHERE
    },
    _sum: { pieces: true }
  });
  const vendidas = sold._sum.pieces ?? 0;

  const esperado = round.basePieces + entradas - salidas - vendidas;

  // ── Lo que enseña la app ──────────────────────────────────────────────────
  const state = await getKardexState(storeId, round.id);
  const teorico = state.summary?.theoretical ?? null;

  if (teorico === null) {
    report(storeName, "la app no devuelve teórico para la ronda más reciente");
  } else if (teorico !== esperado) {
    report(
      storeName,
      `el teórico NO cuadra: la app dice ${teorico} y la cuenta da ${esperado} ` +
        `(base ${round.basePieces} + entradas ${entradas} − salidas ${salidas} − ventas ${vendidas})`
    );
  }

  // El libro tiene que sumar exactamente lo que el teórico le agrega a la base.
  const libro = state.ledger.reduce((total, row) => total + row.signed, 0);
  if (teorico !== null && round.basePieces + libro !== teorico) {
    report(
      storeName,
      `el libro suma ${libro} pero el teórico dice ${teorico - round.basePieces} sobre la base`
    );
  }

  // ── Movimientos imposibles ────────────────────────────────────────────────
  const hoy = todayLocal();
  const [futuros, previos, noPositivos, ajustesSinMotivo] = await Promise.all([
    prisma.inventoryMovement.count({ where: { roundId: round.id, date: { gt: hoy } } }),
    prisma.inventoryMovement.count({ where: { roundId: round.id, date: { lt: round.startDate } } }),
    prisma.inventoryMovement.count({ where: { roundId: round.id, quantity: { lte: 0 } } }),
    prisma.inventoryMovement.count({
      where: {
        roundId: round.id,
        type: { in: ["AJUSTE_POSITIVO", "AJUSTE_NEGATIVO"] },
        OR: [{ note: null }, { note: "" }]
      }
    })
  ]);

  if (futuros > 0) report(storeName, `${futuros} movimiento(s) fechados en el futuro`);
  if (previos > 0) report(storeName, `${previos} movimiento(s) anteriores al inventario que abre la ronda`);
  if (noPositivos > 0) report(storeName, `${noPositivos} movimiento(s) con cantidad cero o negativa`);
  if (ajustesSinMotivo > 0) {
    report(storeName, `${ajustesSinMotivo} ajuste(s) sin motivo: una merma no puede quedar sin explicación`);
  }

  const abiertas = await prisma.inventoryRound.count({ where: { storeId, closedAt: null } });
  if (abiertas > 1) report(storeName, `${abiertas} rondas abiertas a la vez; solo puede haber una`);
}

async function main() {
  const stores = await prisma.store.findMany({ select: { id: true, name: true } });
  for (const store of stores) await auditStore(store.id, store.name);

  if (problems.length === 0) {
    console.log(`[kardex] OK — ${stores.length} tienda(s) revisadas, las piezas cuadran.`);
    return;
  }

  console.error(`[kardex] ⚠️  ${problems.length} problema(s):`);
  for (const problem of problems) console.error(`[kardex]   - ${problem}`);
  process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error("[kardex] la auditoría no pudo correr:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
