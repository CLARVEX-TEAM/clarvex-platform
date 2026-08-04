import { countsAsLate } from "@/lib/attendance";
import type { AttendanceRecord } from "@/lib/attendance-view";

/**
 * "Mi quincena — sin sorpresas": resumen personal del asesor para quitarle la
 * ansiedad de la nómina. TODO sale de datos que la app ya genera (asistencia +
 * banco de horas): no captura nada nuevo ni cambia la matemática de nómina.
 *
 * Política de la tienda (jul-2026): el límite es de 3 RETARDOS al mes. Al 3.er
 * retardo se regresa al colaborador a casa y se le descuenta el día. Aquí solo
 * SE AVISA — la clasificación de asistencia sigue igual que hoy.
 */

/** Retardos permitidos antes de que el siguiente cueste el día. */
export const RETARDO_LIMIT = 3;

export type RetardoTone = "ok" | "warn" | "danger";

export type RetardoStatus = {
  /** Retardos del mes en curso. */
  lates: number;
  /** Límite de la política (3). */
  limit: number;
  /** Cuántos retardos más caben antes de tocar el límite. */
  remaining: number;
  /** El siguiente retardo ya dispara el descuento del día. */
  nextIsPenalty: boolean;
  tone: RetardoTone;
  headline: string;
  detail: string;
};

/**
 * Semáforo de retardos a partir del conteo del mes.
 *
 *   0        → 🟢 al día
 *   hasta L-2→ 🟢 con margen
 *   L-1      → 🟡 el siguiente cuesta el día
 *   ≥ L      → 🔴 en el límite
 */
export function retardoStatus(lates: number, limit = RETARDO_LIMIT): RetardoStatus {
  const safeLates = Math.max(0, lates);
  const remaining = Math.max(0, limit - safeLates);
  const nextIsPenalty = safeLates + 1 >= limit;

  let tone: RetardoTone;
  let headline: string;
  let detail: string;

  if (safeLates >= limit) {
    tone = "danger";
    headline = `${safeLates} retardos este mes · en el límite`;
    detail = `Llegaste al límite de ${limit} retardos. Cuida tus llegadas: otro retardo significa que te regresan a casa y se descuenta el día.`;
  } else if (safeLates === limit - 1) {
    tone = "warn";
    headline = `${safeLates} retardos este mes`;
    detail = `Ojo: el siguiente (el ${limit}.º) retardo del mes te regresa a casa y se descuenta el día.`;
  } else if (safeLates === 0) {
    tone = "ok";
    headline = "Sin retardos este mes 🎉";
    detail = `Vas al día. El ${limit}.º retardo del mes se descuenta como día, así que llevas todo el margen.`;
  } else {
    tone = "ok";
    headline = `${safeLates} ${safeLates === 1 ? "retardo" : "retardos"} este mes`;
    detail = `Te quedan ${remaining} antes de llegar al límite de ${limit} (donde se descuenta el día).`;
  }

  return { lates: safeLates, limit, remaining, nextIsPenalty, tone, headline, detail };
}

/** Retardos del periodo cargado (los records ya vienen filtrados por mes). */
export function countLates(records: AttendanceRecord[]): number {
  return records.reduce((total, record) => total + (countsAsLate(record) ? 1 : 0), 0);
}

/**
 * Correcciones manuales de gerencia sobre la asistencia del asesor, más recientes
 * primero. Es la transparencia que da tranquilidad: si le movieron una hora, lo ve
 * y sabe por qué, en lugar de enterarse el día de pago.
 */
export function manualCorrections(records: AttendanceRecord[]): AttendanceRecord[] {
  return records
    .filter((record) => record.source === "MANUAL")
    .sort((a, b) => b.date.localeCompare(a.date));
}
