import assert from "node:assert/strict";
import test from "node:test";
import { STALE_DATA_DAYS, daysSinceLatestSale, isDataFrozen } from "../lib/sync-freshness";

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const HOY = day("2026-08-05");

test("sin ningun dia con venta no se decide nada", () => {
  // De una fuente que nunca trajo datos ya avisa otra rama; si aquí se
  // devolviera 0 se daría por sana, y si se devolviera Infinity se duplicaría
  // el aviso.
  assert.equal(daysSinceLatestSale(HOY, null), null);
  assert.equal(isDataFrozen(HOY, null), false);
});

test("cuenta los dias completos desde el ultimo dia con venta", () => {
  assert.equal(daysSinceLatestSale(HOY, day("2026-08-05")), 0);
  assert.equal(daysSinceLatestSale(HOY, day("2026-08-04")), 1);
  assert.equal(daysSinceLatestSale(HOY, day("2026-07-29")), 7);
});

test("una venta en un dia futuro NO hace pasar por fresca a la fuente", () => {
  // El caso real: alguien teclea una cifra de prueba en un dia que aun no
  // ocurre. Sin este tope, esa fila dejaria la fuente en verde para siempre.
  assert.equal(daysSinceLatestSale(HOY, day("2026-08-07")), 0);
  assert.equal(isDataFrozen(HOY, day("2026-08-07")), false);
});

test("el margen deja pasar el hueco normal de captura", () => {
  // La tienda captura al dia siguiente y la sincronizacion puede correr antes:
  // hasta STALE_DATA_DAYS no hay averia que suponer.
  for (let atraso = 0; atraso <= STALE_DATA_DAYS; atraso += 1) {
    const fecha = new Date(HOY.getTime() - atraso * 86_400_000);
    assert.equal(isDataFrozen(HOY, fecha), false, `${atraso} dias no deberia alertar`);
  }
});

test("alerta en cuanto se pasa del margen", () => {
  const fecha = new Date(HOY.getTime() - (STALE_DATA_DAYS + 1) * 86_400_000);
  assert.equal(isDataFrozen(HOY, fecha), true);
});
