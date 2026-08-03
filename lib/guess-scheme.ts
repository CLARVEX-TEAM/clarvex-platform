import type { Role } from "@/lib/types";

/**
 * Esquema de comisiones de GUESS (vigente desde agosto de 2026).
 *
 * A diferencia del resto de marcas, aquí los escalones de 80 % a 99.99 % pagan
 * un IMPORTE FIJO —distinto en temporada regular y en temporada alta— y solo
 * del 100 % en adelante se paga un porcentaje sobre la venta.
 *
 * Los importes NO son iguales en todas las tiendas: cada una tiene una etiqueta
 * (E, D, C…) con su propio tabulador. Por eso la app no puede traerlos
 * precargados: los captura cada tienda desde la pantalla que aparece al entrar.
 *
 * Este archivo es lógica pura y sin dependencias del servidor: lo usan tanto el
 * formulario del navegador como la ruta que valida y guarda.
 */

/** Prefijo por el que se reconoce a una tienda de la marca. */
const GUESS_PREFIX = "guess";

/**
 * ¿Es una tienda GUESS? Se decide por el NOMBRE, que en esta marca siempre
 * empieza por "GUESS" (GUESS SAN AGUSTÍN, GUESS VALLE ORIENTE…).
 *
 * Se compara sin acentos, sin mayúsculas y sin espacios de sobra: un nombre
 * capturado como " Guess  Plaza" tiene que reconocerse igual. Se exige que sea
 * el PRINCIPIO del nombre y que ahí termine la palabra, para no atrapar por
 * accidente a una tienda que solo lleve "guess" dentro de otra palabra.
 */
export function isGuessStore(storeName: string | null | undefined): boolean {
  if (!storeName) return false;
  const normalized = storeName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
  if (!normalized.startsWith(GUESS_PREFIX)) return false;
  const next = normalized.charAt(GUESS_PREFIX.length);
  // Fin de cadena o separador: "guess" y "guess san agustin" sí; "guessing" no.
  return next === "" || !/[a-z0-9]/.test(next);
}

export type GuessBracketKind = "FIXED" | "PERCENT";

export type GuessBracket = {
  minAchievement: number;
  maxAchievement: number | null;
  kind: GuessBracketKind;
  label: string;
};

/**
 * Los seis escalones, en orden. El alcance se mide contra el MÍNIMO
 * (venta ÷ mínimo), igual que en el resto de la app.
 *
 * Por debajo del 80 % no hay escalón a propósito: no se paga nada, y la forma
 * de expresarlo es que no exista regla que case.
 */
export const GUESS_BRACKETS: readonly GuessBracket[] = [
  { minAchievement: 80, maxAchievement: 84.99, kind: "FIXED", label: "80 – 84.99 %" },
  { minAchievement: 85, maxAchievement: 89.99, kind: "FIXED", label: "85 – 89.99 %" },
  { minAchievement: 90, maxAchievement: 94.99, kind: "FIXED", label: "90 – 94.99 %" },
  { minAchievement: 95, maxAchievement: 99.99, kind: "FIXED", label: "95 – 99.99 %" },
  { minAchievement: 100, maxAchievement: 114.99, kind: "PERCENT", label: "100 – 114.99 %" },
  { minAchievement: 115, maxAchievement: null, kind: "PERCENT", label: "115 % o más" }
] as const;

/**
 * Los tres puestos del tabulador. El documento de central dice VENDEDOR; en la
 * app ese puesto es ASESOR, así que se mapea aquí una sola vez.
 */
export const GUESS_ROLES: ReadonlyArray<{ role: Role; label: string }> = [
  { role: "GERENTE", label: "Gerente" },
  { role: "SUBGERENTE", label: "Subgerente" },
  { role: "ASESOR", label: "Vendedor" }
] as const;

/** Un escalón capturado. En los de porcentaje, `high` se ignora. */
export type CapturedBracket = {
  minAchievement: number;
  /** Importe fijo o porcentaje, en temporada regular. */
  regular: number;
  /** Importe fijo en temporada alta. En los escalones de porcentaje no aplica. */
  high?: number | null;
};

export type CapturedScheme = {
  /** Etiqueta del tabulador de la tienda (E, D, C…). Opcional. */
  tier?: string | null;
  rows: Array<{ role: Role; brackets: CapturedBracket[] }>;
};

export type SchemeIssue = { field: string; message: string };

/**
 * Valida un tabulador capturado ANTES de tocar la base.
 *
 * Se valida en el servidor aunque el formulario ya lo haga: el formulario es
 * una comodidad para quien captura, no una garantía — a la ruta se le puede
 * llamar directamente.
 *
 * Reglas: los tres puestos completos, los seis escalones de cada uno, sin
 * negativos, y los porcentajes por debajo de 100 (una comisión del 200 % es un
 * dedazo, no un dato). El cero SÍ se admite: una tienda podría no pagar un
 * escalón, y es mejor que lo capture explícitamente a que lo deje en blanco.
 */
export function validateCapturedScheme(scheme: CapturedScheme): SchemeIssue[] {
  const issues: SchemeIssue[] = [];

  for (const { role, label } of GUESS_ROLES) {
    const row = scheme.rows.find((item) => item.role === role);
    if (!row) {
      issues.push({ field: role, message: `Falta el tabulador de ${label}.` });
      continue;
    }
    for (const bracket of GUESS_BRACKETS) {
      const captured = row.brackets.find((item) => item.minAchievement === bracket.minAchievement);
      const field = `${role}.${bracket.minAchievement}`;
      if (!captured) {
        issues.push({ field, message: `${label}: falta el escalón ${bracket.label}.` });
        continue;
      }
      if (!Number.isFinite(captured.regular) || captured.regular < 0) {
        issues.push({ field, message: `${label} · ${bracket.label}: el valor no puede ser negativo.` });
      }
      if (bracket.kind === "PERCENT" && captured.regular >= 100) {
        issues.push({ field, message: `${label} · ${bracket.label}: un porcentaje de comisión de ${captured.regular} % no es válido.` });
      }
      if (bracket.kind === "FIXED") {
        const high = captured.high;
        if (high === null || high === undefined || !Number.isFinite(high) || high < 0) {
          issues.push({ field: `${field}.high`, message: `${label} · ${bracket.label}: falta el importe de temporada alta.` });
        }
      }
    }
  }

  return issues;
}

/** Convierte lo capturado en filas de CommissionRule listas para guardar. */
export function schemeToRules(scheme: CapturedScheme, storeId: string) {
  const rules: Array<{
    storeId: string;
    role: Role;
    minAchievement: number;
    maxAchievement: number | null;
    payoutType: GuessBracketKind;
    commissionPercent: number;
    fixedAmount: number | null;
    fixedAmountHigh: number | null;
    active: boolean;
  }> = [];

  for (const { role } of GUESS_ROLES) {
    const row = scheme.rows.find((item) => item.role === role);
    if (!row) continue;
    for (const bracket of GUESS_BRACKETS) {
      const captured = row.brackets.find((item) => item.minAchievement === bracket.minAchievement);
      if (!captured) continue;
      rules.push({
        storeId,
        role,
        minAchievement: bracket.minAchievement,
        maxAchievement: bracket.maxAchievement,
        payoutType: bracket.kind,
        commissionPercent: bracket.kind === "PERCENT" ? captured.regular : 0,
        fixedAmount: bracket.kind === "FIXED" ? captured.regular : null,
        fixedAmountHigh: bracket.kind === "FIXED" ? captured.high ?? captured.regular : null,
        active: true
      });
    }
  }

  return rules;
}
