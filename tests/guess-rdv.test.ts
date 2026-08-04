import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import * as XLSX from "../lib/spreadsheet";
import { isGuessRdvWorkbook, parseGuessCaptura, parseGuessHeader, parseGuessTabulador } from "../lib/guess-rdv";

/**
 * Se prueba contra el RDV REAL de GUESS zona D (Galerías Monterrey), con los
 * nombres y números de empleado sustituidos por sintéticos. Todo lo demás
 * —estructura, tabulador, metas y ventas— es el archivo tal cual lo envió
 * central, que es justo lo que da valor a estas pruebas: si mañana cambian el
 * formato, esto se entera.
 */
const FIXTURE = path.join(__dirname, "fixtures", "rdv-guess-zona-d.xlsx");

async function loadFixture() {
  const buffer = fs.readFileSync(FIXTURE);
  return XLSX.read(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer);
}

test("reconoce un RDV de GUESS por sus hojas", async () => {
  const workbook = await loadFixture();
  assert.equal(isGuessRdvWorkbook(workbook), true);
});

test("NO confunde un libro cualquiera con un RDV de GUESS", async () => {
  // La detección es lo que protege a las tiendas Tommy: sus archivos no tienen
  // estas hojas, así que nunca pueden entrar por el parser nuevo.
  const otro = { SheetNames: ["Diario de ventas", "COMISIONES"], Sheets: {} } as unknown as XLSX.WorkBook;
  assert.equal(isGuessRdvWorkbook(otro), false);
});

test("lee la cabecera: zona, temporada y meta de TIENDA", async () => {
  const header = parseGuessHeader(await loadFixture());
  assert.ok(header);
  assert.equal(header.brand, "GUESS");
  assert.equal(header.zone, "D");
  assert.match(header.season ?? "", /LS/);
  // La meta de tienda viene explícita. Es la que usan gerente y subgerente, y
  // este RDV no trae bloque de totales del que sacarla de otro modo.
  assert.equal(header.storeGoal, 268974.03);
});

test("lee el tabulador que el propio archivo trae dentro", async () => {
  const tabulador = parseGuessTabulador(await loadFixture());
  assert.ok(tabulador);
  assert.equal(tabulador.tier, "D");
  assert.equal(tabulador.lowSeason, true);
  assert.equal(tabulador.rows.length, 3);
});

test("los importes fijos son los del archivo, por puesto", async () => {
  const tabulador = await loadFixture().then(parseGuessTabulador);
  const gerente = tabulador!.rows.find((row) => row.role === "GERENTE")!;
  const fijos = gerente.brackets.filter((bracket) => bracket.kind === "FIXED");
  assert.deepEqual(fijos.map((b) => b.value), [6637, 8628, 10619, 13273]);

  const vendedor = tabulador!.rows.find((row) => row.role === "ASESOR")!;
  assert.deepEqual(
    vendedor.brackets.filter((b) => b.kind === "FIXED").map((b) => b.value),
    [1978, 2572, 3165, 3956]
  );
});

test("los porcentajes se normalizan: el archivo guarda 0.01611, no 1.611", async () => {
  // Es el error de dos órdenes de magnitud que más caro saldría: 0.01611 leído
  // como porcentaje pagaría 100 veces menos de lo debido.
  const tabulador = await loadFixture().then(parseGuessTabulador);
  const gerente = tabulador!.rows.find((row) => row.role === "GERENTE")!;
  const porcentajes = gerente.brackets.filter((b) => b.kind === "PERCENT");
  assert.deepEqual(porcentajes.map((b) => b.value), [1.611, 1.929]);

  const subgerente = tabulador!.rows.find((row) => row.role === "SUBGERENTE")!;
  assert.deepEqual(subgerente.brackets.filter((b) => b.kind === "PERCENT").map((b) => b.value), [1.177, 1.41]);
});

test("los tramos no se solapan: 85 pertenece a un solo escalón", async () => {
  // El archivo los escribe como "80-85" y "85-90". Sin ajustar el tope, quien
  // esté exactamente en 85 % casaría con los dos.
  const tabulador = await loadFixture().then(parseGuessTabulador);
  const gerente = tabulador!.rows.find((row) => row.role === "GERENTE")!;
  const casan = gerente.brackets.filter((b) => 85 >= b.minAchievement && (b.maxAchievement === null || 85 <= b.maxAchievement));
  assert.equal(casan.length, 1);
  assert.equal(casan[0]!.minAchievement, 85);
});

test("el tramo superior no tiene tope", async () => {
  const tabulador = await loadFixture().then(parseGuessTabulador);
  const gerente = tabulador!.rows.find((row) => row.role === "GERENTE")!;
  const ultimo = gerente.brackets.at(-1)!;
  assert.equal(ultimo.minAchievement, 115);
  assert.equal(ultimo.maxAchievement, null);
});

test("lee la hoja Captura y detecta a los colaboradores con número", async () => {
  const parsed = parseGuessCaptura(await loadFixture());
  assert.equal(parsed.sheetUsed, "Captura");
  // El archivo trae 18 bloques (Gerente 1-2, Subgerente 1-2, Vendedor 1-14),
  // pero solo cinco tienen número de empleado. Los huecos no son personas.
  assert.equal(parsed.employeeNumbers.length, 5);
  assert.deepEqual(parsed.employeeNumbers, ["900001", "900002", "900003", "900004", "900005"]);
});

test("la meta de TIENDA sale de la cabecera", async () => {
  const parsed = parseGuessCaptura(await loadFixture());
  assert.equal(parsed.ttlsMeta, 268974.03);
  // Se lee de la cabecera y no de sumar a las personas aunque hoy coincidan:
  // el día que a una tienda le falte alguien en el archivo, la suma daría de
  // menos y gerencia —que se mide contra la meta de tienda— saldría beneficiada
  // sin que nadie lo note.
  assert.equal(Math.round(parsed.totalGoalImported * 100) / 100, 268974.03);
});

test("OJO: la columna «META dia» suma la meta del MES, no la de la semana", async () => {
  // Hallazgo del archivo real: solo hay 7 días capturados (2–8 de agosto) y la
  // suma de sus «META dia» da exactamente la meta MENSUAL de cada persona.
  // Vendedor 1: 75 902.96, que es su META MES en el propio dashboard.
  //
  // Consecuencia: sumar esta columna para un rango semanal NO da la meta de esa
  // semana. Quien use estos datos para una vista semanal tiene que saberlo.
  const parsed = parseGuessCaptura(await loadFixture());
  assert.equal(parsed.rowsRead, 7);
  assert.equal(parsed.weeksDetected.length, 1);
  assert.equal(Math.round(parsed.employeeTtlsGoals["900003"]! * 100) / 100, 75902.96);
});

test("sin columna de tráfico, la conversión es null y nunca cero", async () => {
  const parsed = parseGuessCaptura(await loadFixture());
  assert.equal(parsed.ttlsTraffic, null);
  assert.ok(parsed.records.length > 0);
  assert.ok(parsed.records.every((record) => record.traffic === null));
  assert.ok(parsed.records.every((record) => record.conversion === null));
});

test("las semanas se derivan de la fecha, no de la columna «Sem»", async () => {
  // La columna «Sem» del archivo dice 1 para estos días. Usarla haría chocar la
  // semana 1 de agosto con la 1 de septiembre. El número correcto es el retail:
  // del 2 al 8 de agosto de 2026 es la semana 31, la misma que ve el resto de
  // la app.
  const parsed = parseGuessCaptura(await loadFixture());
  assert.equal(parsed.weeksDetected.length, 1);
  assert.equal(parsed.weeksDetected[0]!.weekNumber, 31);
  assert.equal(parsed.weeksDetected[0]!.weekStart.toISOString().slice(0, 10), "2026-08-02");
  assert.equal(parsed.weeksDetected[0]!.weekEnd.toISOString().slice(0, 10), "2026-08-08");
});

test("el mes retail se toma de la cabecera del archivo", async () => {
  const parsed = parseGuessCaptura(await loadFixture());
  assert.match(parsed.retailMonthLabel, /^Agosto 2026$/);
  assert.equal(parsed.retailMonthStart.toISOString().slice(0, 10), "2026-08-01");
});

test("GUESS no aporta mínimos de comisión: se mide contra la meta", async () => {
  const parsed = parseGuessCaptura(await loadFixture());
  assert.deepEqual(parsed.employeeCommissionMinimums, {});
  assert.equal(parsed.storeTtlsCommissionMinimum, null);
});

test("los totales de venta cuadran con la suma de los registros", async () => {
  const parsed = parseGuessCaptura(await loadFixture());
  const suma = parsed.records.reduce((total, record) => total + record.dailySales, 0);
  assert.equal(Math.round(parsed.ttlsSales * 100) / 100, Math.round(suma * 100) / 100);
  assert.equal(parsed.ttlsSales, parsed.totalSalesImported);
});

test("las zonas D y E NO comparten importes", async () => {
  // Las láminas que circularon eran de zona E. Este archivo es D. Si algún día
  // alguien vuelve a cargar los de E a mano, este test recuerda que no valen.
  const tabulador = await loadFixture().then(parseGuessTabulador);
  const gerente = tabulador!.rows.find((row) => row.role === "GERENTE")!;
  assert.notEqual(gerente.brackets[0]!.value, 4865, "4865 es el importe de zona E, no de D");
  assert.equal(gerente.brackets[0]!.value, 6637);
});
