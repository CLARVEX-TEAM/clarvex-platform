import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCaptureAlertMessage,
  findStoresNeedingCapture,
  STALE_DATA_DAYS
} from "../lib/capture-freshness";

const HOY = new Date("2026-08-15T00:00:00.000Z");
const dias = (n: number) => new Date(HOY.getTime() - n * 86_400_000);

test("no avisa mientras la captura este al dia", () => {
  const alerts = findStoresNeedingCapture(HOY, [
    { storeId: "a", storeName: "TH SAN AGUSTIN", latestSaleDate: dias(0) },
    { storeId: "b", storeName: "GUESS Galerias", latestSaleDate: dias(1) }
  ]);
  assert.deepEqual(alerts, []);
});

test("respeta el margen: al limite no avisa, un dia mas si", () => {
  // El margen deja pasar el hueco normal (se captura el dia siguiente).
  const enElLimite = findStoresNeedingCapture(HOY, [
    { storeId: "a", storeName: "Tienda", latestSaleDate: dias(STALE_DATA_DAYS) }
  ]);
  assert.equal(enElLimite.length, 0);

  const pasado = findStoresNeedingCapture(HOY, [
    { storeId: "a", storeName: "Tienda", latestSaleDate: dias(STALE_DATA_DAYS + 1) }
  ]);
  assert.equal(pasado.length, 1);
  assert.equal(pasado[0].daysStale, STALE_DATA_DAYS + 1);
});

test("una fecha futura no finge frescura", () => {
  // Un dedazo capturando en un dia que aun no ocurre dejaria la tienda
  // pareciendo al dia para siempre, justo cuando mas falta hace detectarlo.
  const alerts = findStoresNeedingCapture(HOY, [
    { storeId: "a", storeName: "Tienda", latestSaleDate: new Date("2026-09-01T00:00:00.000Z") }
  ]);
  assert.equal(alerts.length, 0);
});

test("por omision NO avisa de una tienda que nunca capturo", () => {
  // Eso no es un olvido: es una puesta en marcha incompleta, y avisar a diario
  // seria ruido para quien no puede arreglarlo desde la pantalla de captura.
  const alerts = findStoresNeedingCapture(HOY, [
    { storeId: "a", storeName: "Tienda nueva", latestSaleDate: null }
  ]);
  assert.deepEqual(alerts, []);
});

test("puede incluirse la que nunca capturo si se pide", () => {
  const alerts = findStoresNeedingCapture(
    HOY,
    [{ storeId: "a", storeName: "Tienda nueva", latestSaleDate: null }],
    { includeNeverCaptured: true }
  );
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].neverCaptured, true);
  assert.equal(alerts[0].daysStale, null);
});

test("ordena primero la tienda mas atrasada", () => {
  const alerts = findStoresNeedingCapture(HOY, [
    { storeId: "a", storeName: "Tres dias", latestSaleDate: dias(3) },
    { storeId: "b", storeName: "Diez dias", latestSaleDate: dias(10) },
    { storeId: "c", storeName: "Cinco dias", latestSaleDate: dias(5) }
  ]);
  assert.deepEqual(alerts.map((a) => a.storeName), ["Diez dias", "Cinco dias", "Tres dias"]);
});

test("el mensaje dice cuantos dias faltan y que hacer", () => {
  const message = buildCaptureAlertMessage({
    storeId: "a",
    storeName: "Tienda",
    daysStale: 4,
    neverCaptured: false
  });
  assert.match(message.title, /4 días/);
  assert.match(message.body, /Captura/);
});

test("la tienda sin captura recibe otro mensaje", () => {
  const message = buildCaptureAlertMessage({
    storeId: "a",
    storeName: "Tienda",
    daysStale: null,
    neverCaptured: true
  });
  assert.match(message.title, /Aún no hay captura/);
});
