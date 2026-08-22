import assert from "node:assert/strict";
import test from "node:test";
import { matchPosRows, posCaptureRows, rowProblems, sameSurname, type PosRow } from "../lib/pos-productivity";

/**
 * Reporte real de TH SAN AGUSTIN del 17 de agosto de 2026, tal como lo enseña
 * el visor del POS. Los nombres van cortados y con la N estropeada a proposito:
 * asi es como llegan.
 */
const fila = (over: Partial<PosRow> & { name: string }): PosRow => ({
  tickets: 0,
  units: 0,
  unitsReturned: 0,
  gross: 0,
  discount: 0,
  afterDiscount: 0,
  returns: 0,
  net: 0,
  avgUnits: 0,
  avgAmount: 0,
  ...over
});

const DIA_17: PosRow[] = [
  fila({ name: "CASTRO, JAZMIN", tickets: 3, units: 4, gross: 6396, discount: 1558.8, afterDiscount: 4837.2, net: 4837.2, avgUnits: 1.33, avgAmount: 1612.4 }),
  fila({ name: "POPOCA, WAIRA ZITLAL", tickets: 1, units: 4, gross: 7096, discount: 2619, afterDiscount: 4477, net: 4477, avgUnits: 4, avgAmount: 4477 }),
  fila({ name: "REYES, ITZEL SAIDY", tickets: 2, units: 4, gross: 4496, discount: 999, afterDiscount: 3497, net: 3497, avgUnits: 2, avgAmount: 1748.5 }),
  fila({ name: "TREVIAO, EDUARDO AL", tickets: 2, units: 3, gross: 4497, discount: 399.6, afterDiscount: 4097.4, net: 4097.4, avgUnits: 1.5, avgAmount: 2048.7 })
];

const reporte = (rows: PosRow[], from = "2026-08-17", to = "2026-08-17") => ({
  from,
  to,
  storeNumber: "3029",
  rows
});

test("convierte la venta a SIN IVA", () => {
  // Verificado contra la base: el 8 de agosto, los 17,697.16 del reporte son
  // los 15,256.17 que quedaron capturados.
  const outcome = posCaptureRows(reporte([
    fila({ name: "HERNANDEZ, JESUS ADR", tickets: 6, units: 12, gross: 24888, discount: 7190.84, afterDiscount: 17697.16, net: 17697.16, avgUnits: 2, avgAmount: 2949.53 })
  ], "2026-08-08", "2026-08-08"));
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.equal(outcome.value[0].dailySales, 15256.17);
});

test("el bruto y el descuento se quedan CON IVA", () => {
  // Tambien verificado contra la base: bruto menos descuento da el neto por
  // 1.16. Al margen el IVA no le afecta, porque es un cociente.
  const outcome = posCaptureRows(reporte(DIA_17));
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.equal(outcome.value[0].grossSales, 6396);
  assert.equal(outcome.value[0].discountAmount, 1558.8);
});

test("tickets y piezas pasan tal cual", () => {
  const outcome = posCaptureRows(reporte(DIA_17));
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.deepEqual(outcome.value.map((row) => [row.transactions, row.pieces]), [[3, 4], [1, 4], [2, 4], [2, 3]]);
});

test("la venta de la tienda del 17 da 14,576.38", () => {
  const outcome = posCaptureRows(reporte(DIA_17));
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  const total = outcome.value.reduce((sum, row) => sum + row.dailySales, 0);
  assert.equal(Math.round(total * 100) / 100, 14576.38);
});

/* ─── La red que sostiene leer una captura de pantalla ───────────────────── */

test("un digito mal leido en el bruto rompe la cuenta y se detiene", () => {
  // 6396 -> 6396 leido como 6896: bruto menos descuento ya no da el neto.
  const malo = [...DIA_17];
  malo[0] = fila({ ...DIA_17[0], gross: 6896 });
  const outcome = posCaptureRows(reporte(malo));
  assert.equal(outcome.ok, false);
  if (outcome.ok) return;
  assert.match(outcome.error, /no cuadran/);
  assert.match(outcome.error, /CASTRO/);
});

test("un digito mal leido en el neto lo caza el promedio", () => {
  // El neto cuadra con bruto-descuento pero ya no con el ticket promedio.
  const malo = [...DIA_17];
  malo[2] = fila({ ...DIA_17[2], gross: 4496, discount: 999, afterDiscount: 3497, net: 3497, avgAmount: 1148.5 });
  const outcome = posCaptureRows(reporte(malo));
  assert.equal(outcome.ok, false);
});

test("las unidades mal leidas las caza el promedio de unidades", () => {
  const malo = [...DIA_17];
  malo[1] = fila({ ...DIA_17[1], units: 9 });
  const outcome = posCaptureRows(reporte(malo));
  assert.equal(outcome.ok, false);
  if (outcome.ok) return;
  assert.match(outcome.error, /unidades/);
});

test("venta con cero tickets se rechaza", () => {
  const outcome = posCaptureRows(reporte([fila({ name: "CASTRO, JAZMIN", tickets: 0, net: 500 })]));
  assert.equal(outcome.ok, false);
});

test("un reporte de VARIOS dias se rechaza", () => {
  // Vienen sumados: capturarlos como un dia meteria la semana entera en una fecha.
  const outcome = posCaptureRows(reporte(DIA_17, "2026-08-10", "2026-08-16"));
  assert.equal(outcome.ok, false);
  if (outcome.ok) return;
  assert.match(outcome.error, /un solo d/);
});

test("un vendedor repetido se rechaza", () => {
  const outcome = posCaptureRows(reporte([DIA_17[0], DIA_17[0]]));
  assert.equal(outcome.ok, false);
  if (outcome.ok) return;
  assert.match(outcome.error, /dos veces/);
});

test("una fila que cuadra no reporta problemas", () => {
  assert.deepEqual(rowProblems(DIA_17[0]), []);
});

/* ─── Emparejar nombres cortados y con la N estropeada ───────────────────── */

const PLANTILLA = [
  { id: "u1", name: "ITZEL SAIDY REYES BAUTISTA", employeeNumber: "81893" },
  { id: "u2", name: "JESUS ADRIAN HERNANDEZ LUNA", employeeNumber: "102259" },
  { id: "u3", name: "WAIRA ZITLALI POPOCA", employeeNumber: "95739" },
  { id: "u4", name: "JAZMIN CASTRO ZUÑIGA", employeeNumber: "96383" },
  { id: "u5", name: "ALONSO TREVIÑO", employeeNumber: "113642" }
];

const capturas = () => {
  const outcome = posCaptureRows(reporte(DIA_17));
  if (!outcome.ok) throw new Error("el reporte de prueba deberia convertirse");
  return outcome.value;
};

test("empareja a los cuatro por apellido", () => {
  const match = matchPosRows(capturas(), PLANTILLA);
  assert.equal(match.matched.length, 4);
  assert.deepEqual(match.unmatched, []);
  assert.deepEqual(match.ambiguous, []);
});

test("empareja aunque el visor estropee la N: TREVIAO es TREVIÑO", () => {
  const match = matchPosRows(capturas(), PLANTILLA);
  assert.equal(match.matched.find((item) => item.row.name.startsWith("TREVIAO"))?.user.id, "u5");
});

test("empareja aunque el nombre venga cortado", () => {
  // «POPOCA, WAIRA ZITLAL» le falta la I final.
  const match = matchPosRows(capturas(), PLANTILLA);
  assert.equal(match.matched.find((item) => item.row.name.startsWith("POPOCA"))?.user.id, "u3");
});

test("quien no aparece en el reporte NO se toca", () => {
  // Adrian no vendio el 17: su fila se queda como esta, no se le pone cero.
  const match = matchPosRows(capturas(), PLANTILLA);
  assert.equal(match.matched.some((item) => item.user.id === "u2"), false);
});

test("NO elige cuando el apellido encaja con dos personas", () => {
  const conDoble = [...PLANTILLA, { id: "u6", name: "MARIA CASTRO LOPEZ", employeeNumber: "99999" }];
  const match = matchPosRows(capturas(), conDoble);
  assert.equal(match.ambiguous.length, 1);
  assert.match(match.ambiguous[0].name, /CASTRO/);
  assert.equal(match.matched.some((item) => item.row.name.startsWith("CASTRO")), false);
});

test("reporta a quien no esta en la plantilla", () => {
  const sinAlonso = PLANTILLA.filter((person) => person.id !== "u5");
  const match = matchPosRows(capturas(), sinAlonso);
  assert.equal(match.unmatched.length, 1);
  assert.match(match.unmatched[0], /TREVIAO/);
});

test("dos letras nunca emparejan, cinco si", () => {
  assert.equal(sameSurname("RE", "REYES"), false);
  assert.equal(sameSurname("REYES", "REYES BAUTISTA"), true);
  assert.equal(sameSurname("TREVIAO", "TREVIÑO"), true);
  assert.equal(sameSurname("CASTRO", "CASTILLO"), false);
  // Apellido corto: se exige entero, no cinco letras que no tiene.
  assert.equal(sameSurname("CRUZ", "CRUZ"), true);
  assert.equal(sameSurname("CRUZ", "CRUZADO"), true);
  assert.equal(sameSurname("CRUZ", "CORONA"), false);
});

test("el promedio de unidades va sobre las NETAS cuando hubo devoluciones", () => {
  // Reporte real del 21 de agosto de 2026: 9 vendidas, 4 devueltas, 3 tickets.
  // El reporte dice 1.67, que es (9-4)/3. Comprobarlo contra las 9 brutas
  // detenia capturas buenas justo los dias en que hubo una devolucion.
  const row = {
    name: "HERNANDEZ, JESUS AD",
    tickets: 3,
    units: 9,
    unitsReturned: 4,
    gross: 11391,
    discount: 2427.64,
    afterDiscount: 8963.36,
    returns: 5896,
    net: 3067.36,
    avgUnits: 1.67,
    avgAmount: 1022.45
  };
  assert.deepEqual(rowProblems(row), []);
});

test("sin devoluciones el promedio sigue siendo unidades entre tickets", () => {
  const row = {
    name: "CASTRO, JAZMIN",
    tickets: 6,
    units: 8,
    unitsReturned: 0,
    gross: 18392,
    discount: 8284.52,
    afterDiscount: 10107.48,
    returns: 0,
    net: 10107.48,
    avgUnits: 1.33,
    avgAmount: 1684.58
  };
  assert.deepEqual(rowProblems(row), []);
});

test("un promedio que NO cuadra ni con netas ni con brutas se detiene", () => {
  const row = {
    name: "PRUEBA",
    tickets: 3,
    units: 9,
    unitsReturned: 4,
    gross: 100,
    discount: 0,
    afterDiscount: 100,
    returns: 0,
    net: 100,
    avgUnits: 9,
    avgAmount: 33.33
  };
  const problems = rowProblems(row);
  assert.equal(problems.length > 0, true);
  assert.match(problems[0], /4 devueltas/);
});
