import { signedQuantity, type InventoryMovementType } from "@/lib/inventory-kardex-entry";

/**
 * Existencia teórica día a día dentro de una ronda.
 *
 * El kardex guarda movimientos sueltos; esto los convierte en una línea de
 * tiempo con el saldo al cierre de cada día, que es como se lee un inventario:
 * no interesa tanto el número de hoy como si viene subiendo o bajando.
 *
 * Módulo sin Prisma a propósito —`lib/prisma` lanza en pruebas—, igual que el
 * resto de la lógica del kardex.
 */

export type DailyMovement = { date: Date; type: InventoryMovementType; quantity: number };
export type DailySalePoint = { date: Date; pieces: number };

export type InventoryDay = {
  /** AAAA-MM-DD */
  date: string;
  /** Entradas del día: recepción, traspasos de entrada, devoluciones. */
  incoming: number;
  /** Salidas del día por traspaso y Ship From Store. NO incluye la venta. */
  outgoing: number;
  /** Piezas vendidas ese día, según KPIs. */
  sold: number;
  /** Neto de ajustes del día, con signo. */
  adjustments: number;
  /** Existencia teórica al CIERRE de ese día. */
  theoretical: number;
};

const dayKey = (date: Date) => date.toISOString().slice(0, 10);

/**
 * Serie diaria desde el inventario que abre la ronda hasta `until`.
 *
 * ⚠️ **El día de apertura se incluye.** RGIS cuenta antes de que la tienda abra,
 * así que lo de ese día ocurre después del conteo — mismo criterio que usan la
 * captura y la suma de ventas. Ver `lib/inventory-kardex-entry`.
 *
 * Se emiten TODOS los días del periodo, también los que no tuvieron movimiento:
 * una línea con huecos se lee como si el inventario hubiera dejado de existir
 * esos días, cuando lo que pasó es que no se movió.
 */
export function buildInventoryDaily({
  basePieces,
  startDate,
  until,
  movements,
  sales
}: {
  basePieces: number;
  startDate: Date;
  until: Date;
  movements: DailyMovement[];
  sales: DailySalePoint[];
}): InventoryDay[] {
  if (until.getTime() < startDate.getTime()) return [];

  const byDay = new Map<string, { incoming: number; outgoing: number; sold: number; adjustments: number }>();
  const ensure = (key: string) => {
    const existing = byDay.get(key);
    if (existing) return existing;
    const fresh = { incoming: 0, outgoing: 0, sold: 0, adjustments: 0 };
    byDay.set(key, fresh);
    return fresh;
  };

  for (const movement of movements) {
    const day = ensure(dayKey(movement.date));
    switch (movement.type) {
      case "RECEPCION":
      case "TRANSFERENCIA_ENTRADA":
      case "DEVOLUCION_CLIENTE":
        day.incoming += movement.quantity;
        break;
      case "TRANSFERENCIA_SALIDA":
      case "SFS":
        day.outgoing += movement.quantity;
        break;
      case "AJUSTE_POSITIVO":
      case "AJUSTE_NEGATIVO":
        day.adjustments += signedQuantity(movement.type, movement.quantity);
        break;
    }
  }
  for (const sale of sales) ensure(dayKey(sale.date)).sold += sale.pieces;

  const series: InventoryDay[] = [];
  let running = basePieces;
  for (let cursor = new Date(startDate.getTime()); cursor.getTime() <= until.getTime(); cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const key = dayKey(cursor);
    const day = byDay.get(key) ?? { incoming: 0, outgoing: 0, sold: 0, adjustments: 0 };
    running += day.incoming + day.adjustments - day.outgoing - day.sold;
    series.push({ date: key, incoming: day.incoming, outgoing: day.outgoing, sold: day.sold, adjustments: day.adjustments, theoretical: running });
  }
  return series;
}

/**
 * Cuánto se movió la existencia respecto al día anterior.
 *
 * Devuelve `null` cuando solo hay un día: sin ayer no hay comparación posible, y
 * un 0 se leería como «no se movió nada», que es otra cosa.
 */
export function dailyChange(series: InventoryDay[]): number | null {
  if (series.length < 2) return null;
  return series[series.length - 1].theoretical - series[series.length - 2].theoretical;
}
