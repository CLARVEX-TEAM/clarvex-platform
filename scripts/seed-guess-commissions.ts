import { PrismaClient, Role, CommissionPayoutType } from "@prisma/client";

/**
 * Carga el tabulador de comisiones de GUESS (esquema vigente desde agosto 2026)
 * en una tienda concreta.
 *
 *   pnpm exec tsx scripts/seed-guess-commissions.ts <storeId>
 *   pnpm exec tsx scripts/seed-guess-commissions.ts <storeId> --dry-run
 *
 * Es EXCLUSIVO de Guess: el resto de marcas sigue con su esquema de porcentaje
 * único. Por eso recibe el `storeId` como argumento y nunca lo adivina.
 *
 * Estructura, tal como viene en las láminas de central:
 *   - Por debajo del 80% no se paga nada (no se crea regla: sin bracket que
 *     case, el cálculo devuelve 0).
 *   - De 80% a 99.99%, cuatro escalones de IMPORTE FIJO, distinto en temporada
 *     regular y en temporada alta.
 *   - Del 100% en adelante, porcentaje sobre la venta total, igual en ambas
 *     temporadas.
 *
 * El alcance se mide contra el MÍNIMO (venta ÷ mínimo), como el resto de la app.
 */

const prisma = new PrismaClient();

type Bracket = {
  minAchievement: number;
  maxAchievement: number | null;
  payoutType: CommissionPayoutType;
  /** Importe fijo (temporada regular) o porcentaje, según payoutType. */
  regular: number;
  /** Importe fijo en temporada alta. En brackets de porcentaje va igual. */
  high: number;
};

const TABULADOR: Record<"GERENTE" | "SUBGERENTE" | "VENDEDOR", Bracket[]> = {
  GERENTE: [
    { minAchievement: 80, maxAchievement: 84.99, payoutType: "FIXED", regular: 4865, high: 12433 },
    { minAchievement: 85, maxAchievement: 89.99, payoutType: "FIXED", regular: 6325, high: 16163 },
    { minAchievement: 90, maxAchievement: 94.99, payoutType: "FIXED", regular: 7784, high: 19893 },
    { minAchievement: 95, maxAchievement: 99.99, payoutType: "FIXED", regular: 9730, high: 24867 },
    { minAchievement: 100, maxAchievement: 114.99, payoutType: "PERCENT", regular: 1.654, high: 1.654 },
    { minAchievement: 115, maxAchievement: null, payoutType: "PERCENT", regular: 1.982, high: 1.982 }
  ],
  SUBGERENTE: [
    { minAchievement: 80, maxAchievement: 84.99, payoutType: "FIXED", regular: 3284, high: 9060 },
    { minAchievement: 85, maxAchievement: 89.99, payoutType: "FIXED", regular: 4269, high: 11778 },
    { minAchievement: 90, maxAchievement: 94.99, payoutType: "FIXED", regular: 5254, high: 14496 },
    { minAchievement: 95, maxAchievement: 99.99, payoutType: "FIXED", regular: 6567, high: 18120 },
    { minAchievement: 100, maxAchievement: 114.99, payoutType: "PERCENT", regular: 1.23, high: 1.23 },
    { minAchievement: 115, maxAchievement: null, payoutType: "PERCENT", regular: 1.473, high: 1.473 }
  ],
  VENDEDOR: [
    { minAchievement: 80, maxAchievement: 84.99, payoutType: "FIXED", regular: 1655, high: 4462 },
    { minAchievement: 85, maxAchievement: 89.99, payoutType: "FIXED", regular: 2152, high: 5800 },
    { minAchievement: 90, maxAchievement: 94.99, payoutType: "FIXED", regular: 2649, high: 7138 },
    { minAchievement: 95, maxAchievement: 99.99, payoutType: "FIXED", regular: 3311, high: 8923 },
    { minAchievement: 100, maxAchievement: 114.99, payoutType: "PERCENT", regular: 2.025, high: 2.025 },
    { minAchievement: 115, maxAchievement: null, payoutType: "PERCENT", regular: 2.427, high: 2.427 }
  ]
};

// El tabulador habla de VENDEDOR; en la app ese puesto es ASESOR.
const ROLE_MAP: Record<keyof typeof TABULADOR, Role> = {
  GERENTE: Role.GERENTE,
  SUBGERENTE: Role.SUBGERENTE,
  VENDEDOR: Role.ASESOR
};

async function main() {
  const storeId = process.argv[2];
  const dryRun = process.argv.includes("--dry-run");

  if (!storeId || storeId.startsWith("--")) {
    throw new Error("Falta el storeId. Uso: pnpm exec tsx scripts/seed-guess-commissions.ts <storeId> [--dry-run]");
  }

  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { id: true, name: true } });
  if (!store) throw new Error(`No existe la tienda "${storeId}".`);

  const previous = await prisma.commissionRule.count({ where: { storeId } });
  console.log(`Tienda: ${store.name} (${store.id})`);
  console.log(`Reglas actuales: ${previous}`);

  if (dryRun) {
    for (const [puesto, brackets] of Object.entries(TABULADOR)) {
      for (const b of brackets) {
        const valor = b.payoutType === "FIXED" ? `$${b.regular} / $${b.high}` : `${b.regular}%`;
        console.log(`  ${puesto.padEnd(11)} ${String(b.minAchievement).padStart(3)}–${b.maxAchievement ?? "∞"}  ${valor}`);
      }
    }
    console.log("\n--dry-run: no se escribió nada.");
    return;
  }

  // Las reglas viejas se DESACTIVAN, no se borran: si hubiera que auditar una
  // comisión pagada con el esquema anterior, la fila sigue ahí.
  await prisma.commissionRule.updateMany({ where: { storeId, active: true }, data: { active: false } });

  let created = 0;
  for (const [puesto, brackets] of Object.entries(TABULADOR) as Array<[keyof typeof TABULADOR, Bracket[]]>) {
    for (const b of brackets) {
      await prisma.commissionRule.create({
        data: {
          storeId,
          role: ROLE_MAP[puesto],
          minAchievement: b.minAchievement,
          maxAchievement: b.maxAchievement,
          payoutType: b.payoutType,
          commissionPercent: b.payoutType === "PERCENT" ? b.regular : 0,
          fixedAmount: b.payoutType === "FIXED" ? b.regular : null,
          fixedAmountHigh: b.payoutType === "FIXED" ? b.high : null,
          active: true
        }
      });
      created++;
    }
  }

  console.log(`Reglas desactivadas: ${previous} · creadas: ${created}`);
  console.log("Recuerda cargar los rangos de TEMPORADA ALTA en CommissionSeason: sin ellos todo se paga como regular.");
}

main()
  .catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); })
  .finally(() => prisma.$disconnect());
