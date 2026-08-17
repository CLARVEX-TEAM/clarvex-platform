import assert from "node:assert/strict";
import test from "node:test";
import {
  countDifference,
  movementLabel,
  normalizeRoundEntry,
  normalizeMovementEntry,
  signedQuantity,
  summarizeKardex
} from "../lib/inventory-kardex-entry";

const BASE = new Date("2026-08-18T00:00:00.000Z"); // inventario inicial
const HOY = new Date("2026-08-31T00:00:00.000Z");
const ctx = { round: { start: BASE, end: null }, today: HOY };

const movimiento = (over: Record<string, unknown> = {}) => ({
  date: "2026-08-20",
  type: "RECEPCION",
  quantity: 40,
  ...over
});

test("normaliza un movimiento valido", () => {
  const outcome = normalizeMovementEntry(
    movimiento({ reference: " TR-1099 ", counterpart: "CEDIS", createdBy: "81893" }),
    ctx
  );
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.equal(outcome.value.type, "RECEPCION");
  assert.equal(outcome.value.quantity, 40);
  assert.equal(outcome.value.reference, "TR-1099");
  assert.equal(outcome.value.counterpart, "CEDIS");
  assert.equal(outcome.value.date.toISOString(), "2026-08-20T00:00:00.000Z");
});

test("el tipo pone el signo, no la cantidad", () => {
  assert.equal(signedQuantity("RECEPCION", 40), 40);
  assert.equal(signedQuantity("TRANSFERENCIA_ENTRADA", 40), 40);
  assert.equal(signedQuantity("DEVOLUCION_CLIENTE", 2), 2);
  assert.equal(signedQuantity("TRANSFERENCIA_SALIDA", 12), -12);
  assert.equal(signedQuantity("AJUSTE_POSITIVO", 5), 5);
  assert.equal(signedQuantity("AJUSTE_NEGATIVO", 5), -5);
});

test("rechaza cantidades negativas o cero", () => {
  // Capturar un traspaso de salida en negativo sumaria mercancia en vez de
  // restarla, y nada lo delataria: el sentido lo da el tipo.
  const negativo = normalizeMovementEntry(movimiento({ type: "TRANSFERENCIA_SALIDA", quantity: -12 }), ctx);
  assert.equal(negativo.ok, false);
  const cero = normalizeMovementEntry(movimiento({ quantity: 0 }), ctx);
  assert.equal(cero.ok, false);
});

test("exige piezas enteras", () => {
  const outcome = normalizeMovementEntry(movimiento({ quantity: 2.5 }), ctx);
  assert.equal(outcome.ok, false);
});

test("rechaza un movimiento anterior al inventario que abre la ronda", () => {
  // Es el fallo mas caro posible: contaria mercancia que ya se conto fisicamente
  // y el teorico saldria inflado sin ninguna senal de error.
  const outcome = normalizeMovementEntry(movimiento({ date: "2026-08-17" }), ctx);
  assert.equal(outcome.ok, false);
  if (outcome.ok) return;
  assert.match(outcome.error, /anterior al inventario que abre la ronda/);
});

test("el DIA del inventario SI entra en la ronda", () => {
  // RGIS cuenta antes de que la tienda abra, asi que lo de ese dia ocurre
  // DESPUES del conteo. Lo confirma el kardex real: su "Ultimo Inventario" es el
  // 18 de febrero y la primera fila de la hoja Ventas es de ese mismo dia.
  const outcome = normalizeMovementEntry(movimiento({ date: "2026-08-18" }), ctx);
  assert.equal(outcome.ok, true);
});

test("el dia siguiente tambien, obviamente", () => {
  const outcome = normalizeMovementEntry(movimiento({ date: "2026-08-19" }), ctx);
  assert.equal(outcome.ok, true);
});

test("rechaza fechas futuras e inexistentes", () => {
  assert.equal(normalizeMovementEntry(movimiento({ date: "2026-09-15" }), ctx).ok, false);
  // 31 de febrero no da NaN: rueda a marzo. Por eso se compara el ida y vuelta.
  assert.equal(normalizeMovementEntry(movimiento({ date: "2026-02-31" }), ctx).ok, false);
});

test("un ajuste sin motivo no pasa", () => {
  // Un ajuste es una diferencia que se absorbe. Sin motivo, la merma desaparece
  // sin explicacion, que es justo lo que este kardex existe para evitar.
  const sinMotivo = normalizeMovementEntry(movimiento({ type: "AJUSTE_NEGATIVO", quantity: 75 }), ctx);
  assert.equal(sinMotivo.ok, false);
  if (sinMotivo.ok) return;
  assert.match(sinMotivo.error, /motivo/);

  const conMotivo = normalizeMovementEntry(
    movimiento({ type: "AJUSTE_NEGATIVO", quantity: 75, note: "Merma autorizada tras revision de agosto" }),
    ctx
  );
  assert.equal(conMotivo.ok, true);
});

test("los demas movimientos no exigen motivo", () => {
  assert.equal(normalizeMovementEntry(movimiento({ type: "TRANSFERENCIA_SALIDA" }), ctx).ok, true);
});

test("rechaza un tipo desconocido", () => {
  const outcome = normalizeMovementEntry(movimiento({ type: "MERMA" }), ctx);
  assert.equal(outcome.ok, false);
});

test("rechaza una cantidad absurda", () => {
  // Teclear el folio en la casilla de la cantidad envenenaria el teorico.
  const outcome = normalizeMovementEntry(movimiento({ quantity: 900_000 }), ctx);
  assert.equal(outcome.ok, false);
});

test("acepta la cantidad como texto con separadores", () => {
  const outcome = normalizeMovementEntry(movimiento({ quantity: "1,250" }), ctx);
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.equal(outcome.value.quantity, 1250);
});

test("los textos vacios quedan en null, no en cadena vacia", () => {
  const outcome = normalizeMovementEntry(movimiento({ reference: "   ", counterpart: "" }), ctx);
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.equal(outcome.value.reference, null);
  assert.equal(outcome.value.counterpart, null);
});

test("el teorico suma entradas y resta salidas y ventas", () => {
  const summary = summarizeKardex({
    basePieces: 3500,
    soldPieces: 120,
    movements: [
      { type: "RECEPCION", quantity: 200 },
      { type: "TRANSFERENCIA_ENTRADA", quantity: 30 },
      { type: "DEVOLUCION_CLIENTE", quantity: 4 },
      { type: "TRANSFERENCIA_SALIDA", quantity: 45 }
    ]
  });
  assert.equal(summary.received, 200);
  assert.equal(summary.transferredIn, 30);
  assert.equal(summary.customerReturns, 4);
  assert.equal(summary.transferredOut, 45);
  assert.equal(summary.sold, 120);
  // 3500 + 200 + 30 + 4 − 45 − 120
  assert.equal(summary.theoretical, 3569);
});

test("reproduce el kardex real de TOMMY SAN AGUSTIN (1ra ronda 2026)", () => {
  // Numeros del archivo que lleva la tienda a mano, para que el calculo no se
  // aleje del que ya usan y saben leer:
  //   base 6430 (inventario del 18 feb) + 8243 entradas - 7314 salidas = 7359
  // Sus "ventas netas" (5275) son brutas menos devoluciones (5372 - 97); aqui
  // entran por separado y dan lo mismo.
  const summary = summarizeKardex({
    basePieces: 6430,
    soldPieces: 5372,
    movements: [
      { type: "RECEPCION", quantity: 8220 },
      { type: "TRANSFERENCIA_ENTRADA", quantity: 23 },
      { type: "DEVOLUCION_CLIENTE", quantity: 97 },
      { type: "TRANSFERENCIA_SALIDA", quantity: 2039 },
      { type: "SFS", quantity: 0 }
    ]
  });
  assert.equal(summary.received + summary.transferredIn, 8243);
  assert.equal(summary.transferredOut + summary.shipFromStore + summary.sold - summary.customerReturns, 7314);
  assert.equal(summary.theoretical, 7359);
});

test("SFS es una salida, como el traspaso enviado", () => {
  assert.equal(signedQuantity("SFS", 30), -30);
  const summary = summarizeKardex({
    basePieces: 1000,
    soldPieces: 0,
    movements: [{ type: "SFS", quantity: 30 }]
  });
  assert.equal(summary.shipFromStore, 30);
  assert.equal(summary.theoretical, 970);
});

test("los ajustes entran netos y con su signo", () => {
  const summary = summarizeKardex({
    basePieces: 1000,
    soldPieces: 0,
    movements: [
      { type: "AJUSTE_POSITIVO", quantity: 10 },
      { type: "AJUSTE_NEGATIVO", quantity: 75 }
    ]
  });
  assert.equal(summary.adjustments, -65);
  assert.equal(summary.theoretical, 935);
});

test("sin movimientos el teorico es la base menos lo vendido", () => {
  const summary = summarizeKardex({ basePieces: 3412, soldPieces: 15, movements: [] });
  assert.equal(summary.theoretical, 3397);
});

test("la diferencia negativa significa que falta mercancia", () => {
  assert.equal(countDifference(3412, 3487), -75);
  assert.equal(countDifference(3500, 3487), 13);
  assert.equal(countDifference(3487, 3487), 0);
});

const ronda = (over: Record<string, unknown> = {}) => ({
  name: "2da ronda 2026",
  startDate: "2026-08-18",
  basePieces: 3412,
  ...over
});

test("valida la apertura de una ronda", () => {
  const ok = normalizeRoundEntry(ronda({ basePieces: "3,412", countId: "abc" }), { today: HOY });
  assert.equal(ok.ok, true);
  if (!ok.ok) return;
  assert.equal(ok.value.basePieces, 3412);
  assert.equal(ok.value.countId, "abc");
  assert.equal(ok.value.name, "2da ronda 2026");

  assert.equal(normalizeRoundEntry(ronda({ basePieces: -5 }), { today: HOY }).ok, false);
  assert.equal(normalizeRoundEntry(ronda({ startDate: "2026-09-30" }), { today: HOY }).ok, false);
  assert.equal(normalizeRoundEntry(ronda({ basePieces: 10.5 }), { today: HOY }).ok, false);
});

test("la ronda necesita nombre", () => {
  // Sin nombre, el historial de rondas se vuelve una lista de fechas sueltas.
  assert.equal(normalizeRoundEntry(ronda({ name: "   " }), { today: HOY }).ok, false);
});

test("una tienda puede arrancar el kardex en cero", () => {
  // Tienda nueva sin mercancia: es un dato valido, no un olvido de captura.
  assert.equal(normalizeRoundEntry(ronda({ basePieces: 0 }), { today: HOY }).ok, true);
});

test("una ronda cerrada no admite movimientos posteriores a su cierre", () => {
  // Esa ronda ya se comparo contra su conteo fisico; mover su teorico despues
  // cambiaria un numero del que ya se sacaron conclusiones.
  const cerrada = { round: { start: BASE, end: new Date("2026-08-25T00:00:00.000Z") }, today: HOY };
  const dentro = normalizeMovementEntry(movimiento({ date: "2026-08-25" }), cerrada);
  assert.equal(dentro.ok, true);

  const fuera = normalizeMovementEntry(movimiento({ date: "2026-08-26" }), cerrada);
  assert.equal(fuera.ok, false);
  if (fuera.ok) return;
  assert.match(fuera.error, /ronda cerró/);
});

test("guarda sobrantes y faltantes de la caja", () => {
  // No entran al teorico —quantity ya son las piezas realmente recibidas— pero
  // son la primera pista cuando el conteo de cierre no cuadra.
  const outcome = normalizeMovementEntry(movimiento({ surplus: 2, missing: 1, document: "M0030013372355", delivery: "81717606" }), ctx);
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.equal(outcome.value.surplus, 2);
  assert.equal(outcome.value.missing, 1);
  assert.equal(outcome.value.document, "M0030013372355");
  assert.equal(outcome.value.delivery, "81717606");

  const sinCapturar = normalizeMovementEntry(movimiento(), ctx);
  assert.equal(sinCapturar.ok, true);
  if (!sinCapturar.ok) return;
  assert.equal(sinCapturar.value.surplus, null);

  assert.equal(normalizeMovementEntry(movimiento({ surplus: -1 }), ctx).ok, false);
  assert.equal(normalizeMovementEntry(movimiento({ missing: "dos" }), ctx).ok, false);
});

test("el codigo del catalogo rellena la etiqueta solo", () => {
  // Sin esto, el mismo destino acaba escrito de dos formas distintas segun quien
  // capture, y agrupar por contraparte deja de servir.
  const outcome = normalizeMovementEntry(
    movimiento({ type: "TRANSFERENCIA_SALIDA", counterpartCode: "03009" }),
    ctx
  );
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.equal(outcome.value.counterpartCode, "03009");
  assert.equal(outcome.value.counterpart, "O. MTY");
});

test("una etiqueta escrita a mano gana sobre la del catalogo", () => {
  const outcome = normalizeMovementEntry(
    movimiento({ counterpartCode: "03009", counterpart: "Outlet Monterrey (bodega)" }),
    ctx
  );
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.equal(outcome.value.counterpart, "Outlet Monterrey (bodega)");
  assert.equal(outcome.value.counterpartCode, "03009");
});

test("un codigo fuera del catalogo se rechaza", () => {
  const outcome = normalizeMovementEntry(movimiento({ counterpartCode: "03999" }), ctx);
  assert.equal(outcome.ok, false);
  if (outcome.ok) return;
  assert.match(outcome.error, /no está en el catálogo/);
});

test("sin codigo se admite texto libre", () => {
  // La recepcion de mercancia no siempre tiene contraparte del catalogo.
  const outcome = normalizeMovementEntry(movimiento({ counterpart: "PROVEEDOR EXTERNO" }), ctx);
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.equal(outcome.value.counterpartCode, null);
  assert.equal(outcome.value.counterpart, "PROVEEDOR EXTERNO");
});

test("cada tipo tiene etiqueta legible", () => {
  assert.equal(movementLabel("DEVOLUCION_CLIENTE"), "Devolución de cliente");
  assert.equal(movementLabel("TRANSFERENCIA_SALIDA"), "Traspaso de salida");
});
