import { daysSinceLatestSale, STALE_DATA_DAYS } from "@/lib/sync-freshness";

/**
 * ¿Se está capturando la operación de cada tienda?
 *
 * Sustituye a `sync-alert`, que vigilaba que los enlaces de Excel de Axo
 * siguieran trayendo días nuevos. Esas fuentes se retiraron el 14 de agosto de
 * 2026 y ahora la operación se captura a mano en Retool.
 *
 * ⚠️ La necesidad no desapareció al cambiar de mecanismo: **cambió de forma, y
 * a peor**. Antes fallaba una máquina; ahora depende de que una persona se
 * acuerde todos los días. Si una gerente deja de capturar, no hay error, no hay
 * enlace roto y nada se pone rojo: los KPIs simplemente se quedan quietos y las
 * decisiones se toman sobre datos viejos sin que nadie lo note.
 *
 * Se reutiliza a propósito el criterio de `lib/sync-freshness`: el mismo margen
 * de días y el mismo trato a las fechas futuras, para que «datos congelados»
 * signifique lo mismo antes y después de la migración.
 */

export type StoreCaptureState = {
  storeId: string;
  storeName: string;
  /** Último día CON VENTA capturada. `null` si nunca se ha capturado nada. */
  latestSaleDate: Date | null;
};

export type CaptureAlert = {
  storeId: string;
  storeName: string;
  /** Días completos sin un día nuevo con venta. `null` si nunca hubo ninguno. */
  daysStale: number | null;
  /** true cuando la tienda no tiene ni un solo día capturado. */
  neverCaptured: boolean;
};

/**
 * Decide qué tiendas merecen aviso.
 *
 * Se distinguen dos casos porque piden acciones distintas: una tienda que
 * capturaba y dejó de hacerlo es un olvido reciente; una que nunca ha capturado
 * es una puesta en marcha incompleta —falta invitar a alguien, o asignarle sus
 * atributos— y avisar de ella todos los días sería ruido.
 */
export function findStoresNeedingCapture(
  today: Date,
  stores: StoreCaptureState[],
  { includeNeverCaptured = false }: { includeNeverCaptured?: boolean } = {}
): CaptureAlert[] {
  const alerts: CaptureAlert[] = [];
  for (const store of stores) {
    const daysStale = daysSinceLatestSale(today, store.latestSaleDate);
    if (daysStale === null) {
      if (includeNeverCaptured) {
        alerts.push({ storeId: store.storeId, storeName: store.storeName, daysStale: null, neverCaptured: true });
      }
      continue;
    }
    if (daysStale > STALE_DATA_DAYS) {
      alerts.push({ storeId: store.storeId, storeName: store.storeName, daysStale, neverCaptured: false });
    }
  }
  // El más atrasado primero: es el que más urge.
  return alerts.sort((left, right) => (right.daysStale ?? Infinity) - (left.daysStale ?? Infinity));
}

/**
 * Mensaje para la gerencia de la tienda. Se le habla de su tienda, no del
 * sistema: quien lo recibe tiene que saber qué hacer sin traducir nada.
 */
export function buildCaptureAlertMessage(alert: CaptureAlert): { title: string; body: string } {
  if (alert.neverCaptured) {
    return {
      title: "Aún no hay captura de esta tienda",
      body: "No se ha registrado ningún día de venta. Entra a Captura para empezar; sin datos, los KPIs y las comisiones se quedan vacíos."
    };
  }
  const days = alert.daysStale ?? 0;
  return {
    title: `Faltan ${days} días de captura`,
    body: `El último día con venta registrada tiene ${days} días. Entra a Captura y pon al día los KPIs: mientras falten, el avance y las comisiones se calculan con datos viejos.`
  };
}

export { STALE_DATA_DAYS };
