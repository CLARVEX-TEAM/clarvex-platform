/**
 * Validación de una fila de margen DTO capturada a mano.
 *
 * Vive aparte de `lib/discount-capture` porque ese módulo importa Prisma, y
 * `lib/prisma` lanza en el entorno de pruebas.
 *
 * Solo se capturan **venta bruta y descuento**. El margen NO se captura: se
 * calcula. El archivo original tampoco traía columna de margen — ver la sección
 * «Margen DTO» de `CLAUDE.md`.
 */

/** Techo defensivo para una venta bruta semanal por persona. */
const MAX_AMOUNT = 50_000_000;

export type DiscountCaptureEntry = {
  employeeNumber: string;
  weekNumber: number | string;
  grossSales?: number | string | null;
  discountAmount?: number | string | null;
};

export type NormalizedDiscountEntry = {
  employeeNumber: string;
  weekNumber: number;
  grossSales: number;
  discountAmount: number;
  /** `descuento / venta bruta`. Derivado, nunca capturado. */
  discountMargin: number;
};

export type NormalizeDiscountOutcome =
  | { ok: true; value: NormalizedDiscountEntry }
  | { ok: false; error: string };

export function normalizeDiscountEntry(entry: DiscountCaptureEntry): NormalizeDiscountOutcome {
  const employeeNumber = String(entry.employeeNumber ?? "").trim();
  if (!employeeNumber) return { ok: false, error: "Falta el número de empleado." };

  const weekNumber = toNumber(entry.weekNumber);
  if (weekNumber === null || !Number.isInteger(weekNumber) || weekNumber < 1 || weekNumber > 53) {
    return { ok: false, error: `${employeeNumber}: número de semana inválido (${String(entry.weekNumber)}). Se espera 1–53.` };
  }

  const grossSales = toNumber(entry.grossSales);
  const discountAmount = toNumber(entry.discountAmount);
  if (grossSales === null) return { ok: false, error: `${employeeNumber} (semana ${weekNumber}): la venta bruta no es un número.` };
  if (discountAmount === null) return { ok: false, error: `${employeeNumber} (semana ${weekNumber}): el descuento no es un número.` };
  if (grossSales < 0 || discountAmount < 0) {
    return { ok: false, error: `${employeeNumber} (semana ${weekNumber}): no puede haber importes negativos.` };
  }
  if (grossSales > MAX_AMOUNT || discountAmount > MAX_AMOUNT) {
    return { ok: false, error: `${employeeNumber} (semana ${weekNumber}): importe fuera de rango, parece un error de captura.` };
  }

  // El importador solo guarda filas con venta bruta > 0: sin ella el margen no
  // significa nada y ensuciaría la semana con un 0 % engañoso.
  if (grossSales === 0) {
    return { ok: false, error: `${employeeNumber} (semana ${weekNumber}): sin venta bruta no se puede calcular el margen.` };
  }
  // Descontar más de lo vendido no ocurre: es un dato mal leído.
  if (discountAmount > grossSales) {
    return {
      ok: false,
      error: `${employeeNumber} (semana ${weekNumber}): el descuento (${discountAmount}) supera la venta bruta (${grossSales}).`
    };
  }

  return {
    ok: true,
    value: {
      employeeNumber,
      weekNumber,
      grossSales,
      discountAmount,
      discountMargin: computeDiscountMargin(grossSales, discountAmount)
    }
  };
}

/**
 * `descuento / venta bruta`, en tanto por uno.
 *
 * ⚠️ Este margen es un TECHO, no una meta: pasarse es malo. `isCeiling()` en
 * `lib/kpi-view.ts` es quien lo sabe a la hora de pintar el semáforo — sin eso,
 * la regla genérica «verde si valor ≥ meta» pintaba verde justo al excederlo.
 */
export function computeDiscountMargin(grossSales: number, discountAmount: number): number {
  return grossSales > 0 ? discountAmount / grossSales : 0;
}

function toNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return 0;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const cleaned = String(raw).trim().replace(/[$\s,%]/g, "");
  if (!cleaned) return 0;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}
