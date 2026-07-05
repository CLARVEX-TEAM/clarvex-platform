import assert from "node:assert/strict";
import test from "node:test";
import type { KpiReportItem } from "../lib/kpi-report";
import { buildWeeklyCloseColumn, buildWeeklyCloseColumns, distributeWhatsappBudget, firstName } from "../lib/weekly-close";

// Datos reales del formato de tienda (San Agustín, semana 25) usados para
// verificar que las fórmulas de pérdida replican el Excel original.
function member(overrides: Partial<KpiReportItem>): KpiReportItem {
  const base: KpiReportItem = {
    userId: "u1", userName: "Asesor", role: "ASESOR", avatar: "AS", photoUrl: null,
    sales: 0, goal: 0, achievement: 0, transactions: 0, pieces: 0,
    upt: null, aur: null, ept: null, conversion: null, traffic: null, ranking: 0,
    grossSales: null, orkestraSales: null, orkestraTransactions: null, orkestraPieces: null,
    discountAmount: null, discountMargin: null, discountLimit: null,
    commissionAmount: 0, commissionPercent: 0, commissionMinimum: null
  };
  const merged = { ...base, ...overrides };
  if (merged.transactions > 0) {
    merged.upt = overrides.upt ?? round2(merged.pieces / merged.transactions);
    merged.ept = overrides.ept ?? round2(merged.sales / merged.transactions);
  }
  if (merged.pieces > 0) merged.aur = overrides.aur ?? round2(merged.sales / merged.pieces);
  return merged;
}

function round2(value: number) { return Math.round(value * 100) / 100; }

const storeTotal = member({
  userId: "store", userName: "Tienda", role: "GERENTE",
  sales: 327_711.02, goal: 258_388.46, transactions: 162, pieces: 285, traffic: 1870,
  achievement: 126.83, conversion: 8.66
});

const itzel = member({
  userId: "itzel", userName: "Itzel", sales: 35_894.95, goal: 25_838.85,
  transactions: 23, pieces: 36, traffic: 1870, achievement: 138.92, conversion: 1.23
});

const waira = member({
  userId: "waira", userName: "Waira", sales: 101_091.99, goal: 78_072.82,
  transactions: 46, pieces: 88, traffic: 1140, achievement: 129.48, conversion: 4.04
});

const jazmin = member({
  userId: "jazmin", userName: "Jazmín", sales: 106_317.39, goal: 77_845,
  transactions: 49, pieces: 87, traffic: 1619, achievement: 136.58, conversion: 3.03
});

const alonso = member({
  userId: "alonso", userName: "Alonso", sales: 84_406.69, goal: 76_631.8,
  transactions: 44, pieces: 74, traffic: 1624, achievement: 110.15, conversion: 2.71
});

const adrian = member({ userId: "adrian", userName: "Adrián", sales: 0, goal: 0, transactions: 0, pieces: 0 });

test("pérdida EPT replica el formato original (±$10 por redondeo)", () => {
  const column = buildWeeklyCloseColumn(itzel, storeTotal);
  assert.ok(column.lossEpt !== null && Math.abs(column.lossEpt - -10_631.92) < 10, `lossEpt=${column.lossEpt}`);
  const wairaColumn = buildWeeklyCloseColumn(waira, storeTotal);
  assert.ok(wairaColumn.lossEpt !== null && Math.abs(wairaColumn.lossEpt - 8_038.24) < 10, `lossEpt=${wairaColumn.lossEpt}`);
});

test("pérdida UPT replica el formato original (±$15 por redondeo)", () => {
  const column = buildWeeklyCloseColumn(itzel, storeTotal);
  assert.ok(column.lossUpt !== null && Math.abs(column.lossUpt - -4_449.94) < 15, `lossUpt=${column.lossUpt}`);
  // El formato original trae decimales ocultos en los datos de Alonso; ±$60.
  const alonsoColumn = buildWeeklyCloseColumn(alonso, storeTotal);
  assert.ok(alonsoColumn.lossUpt !== null && Math.abs(alonsoColumn.lossUpt - -3_836.59) < 60, `lossUpt=${alonsoColumn.lossUpt}`);
});

test("pérdida AUR replica el formato original (±$10 por redondeo)", () => {
  const column = buildWeeklyCloseColumn(itzel, storeTotal);
  assert.ok(column.lossAur !== null && Math.abs(column.lossAur - -5_500.13) < 10, `lossAur=${column.lossAur}`);
  const wairaColumn = buildWeeklyCloseColumn(waira, storeTotal);
  assert.ok(wairaColumn.lossAur !== null && Math.abs(wairaColumn.lossAur - -95.97) < 10, `lossAur=${wairaColumn.lossAur}`);
});

test("indicador a trabajar: mayor pérdida entre UPT y AUR", () => {
  assert.equal(buildWeeklyCloseColumn(itzel, storeTotal).focus, "AUR");
  assert.equal(buildWeeklyCloseColumn(alonso, storeTotal).focus, "UPT");
  assert.equal(buildWeeklyCloseColumn(waira, storeTotal).focus, "AUR");
});

test("indicador a trabajar: todo positivo → FELICIDADES, sin venta → SIN DATOS", () => {
  assert.equal(buildWeeklyCloseColumn(jazmin, storeTotal).focus, "FELICIDADES");
  assert.equal(buildWeeklyCloseColumn(adrian, storeTotal).focus, "SIN DATOS");
});

test("sin tickets no hay pérdidas ni división entre cero", () => {
  const column = buildWeeklyCloseColumn(adrian, storeTotal);
  assert.equal(column.lossEpt, null);
  assert.equal(column.lossUpt, null);
  assert.equal(column.lossAur, null);
  assert.equal(column.difference, 0);
});

test("meta WhatsApp: PPTO repartido en partes iguales entre asesores con venta", () => {
  // 4 con venta (Itzel, Waira, Jazmín, Alonso) + Adrián sin venta
  const columns = buildWeeklyCloseColumns([itzel, adrian, waira, jazmin, alonso], storeTotal, 1_381.06);
  const itzelColumn = columns.find((column) => column.name === "Itzel")!;
  const adrianColumn = columns.find((column) => column.name === "Adrián")!;
  assert.equal(itzelColumn.waMeta, 345.27); // 1381.06 / 4
  assert.equal(adrianColumn.waMeta, null);  // sin venta, sin meta
  // El total de tienda conserva el PPTO completo
  const store = buildWeeklyCloseColumn(storeTotal, storeTotal, 1_381.06);
  assert.equal(store.waMeta, 1_381.06);
});

test("meta WhatsApp: sin PPTO capturado no hay metas", () => {
  const columns = buildWeeklyCloseColumns([itzel, waira], storeTotal);
  assert.equal(columns[0].waMeta, null);
  assert.equal(columns[1].waMeta, null);
});

test("reparto por días laborados: gerente 10% fijo por día (como HORARIOS)", () => {
  // Itzel (gerente) labora los 7 días → 10% del PPTO = $138.11 (igual que la referencia)
  const roles = new Map<string, KpiReportItem["role"]>([["g1", "GERENTE"], ["a1", "ASESOR"], ["a2", "ASESOR"]]);
  const presence = new Map<string, Set<string>>();
  for (let day = 1; day <= 7; day += 1) presence.set(`2026-06-0${day}`, new Set(["g1", "a1", "a2"]));
  const result = distributeWhatsappBudget(1_381.06, presence, roles);
  assert.equal(result.get("g1"), 138.11); // 10% × PPTO
  // Los asesores se reparten el 90% en partes iguales: 45% cada uno
  assert.equal(result.get("a1"), 621.48);
  assert.equal(result.get("a2"), 621.48);
});

test("reparto por días laborados: quien no labora un día no participa ese día", () => {
  const roles = new Map<string, KpiReportItem["role"]>([["a1", "ASESOR"], ["a2", "ASESOR"]]);
  const presence = new Map<string, Set<string>>([
    ["2026-06-01", new Set(["a1", "a2"])], // ambos: 50% cada uno
    ["2026-06-02", new Set(["a1"])]        // solo a1: 100%
  ]);
  const result = distributeWhatsappBudget(700, presence, roles);
  const daily = 100; // 700 / 7
  assert.equal(result.get("a1"), daily * 0.5 + daily); // 150
  assert.equal(result.get("a2"), daily * 0.5);         // 50
});

test("reparto por días laborados: sin PPTO devuelve mapa vacío", () => {
  assert.equal(distributeWhatsappBudget(0, new Map(), new Map()).size, 0);
});

test("columnas usan el reparto por horarios cuando existe", () => {
  const waMetaByUser = new Map<string, number>([["itzel", 138.11], ["waira", 400]]);
  const columns = buildWeeklyCloseColumns([itzel, waira, alonso], storeTotal, 1_381.06, waMetaByUser);
  assert.equal(columns.find((column) => column.name === "Itzel")!.waMeta, 138.11);
  assert.equal(columns.find((column) => column.name === "Waira")!.waMeta, 400);
  // Alonso sin días laborados registrados → sin meta
  assert.equal(columns.find((column) => column.name === "Alonso")!.waMeta, null);
});

test("columnas ordenadas por rol y nombre", () => {
  const gerente = member({ userId: "g", userName: "Zoe", role: "GERENTE", sales: 10, transactions: 1, pieces: 1 });
  const columns = buildWeeklyCloseColumns([alonso, gerente, itzel], storeTotal);
  assert.deepEqual(columns.map((column) => column.name), ["Zoe", "Alonso", "Itzel"]);
});

test("columnas en el orden del RDV cuando el sync lo reporta", () => {
  // RDV: Itzel (gerente), Adrián (subgerente), Waira, Jazmín, Alonso.
  // El orden alfabético pondría Alonso antes que Waira; el RDV manda.
  const rdvOrder = new Map([["itzel", 0], ["adrian", 1], ["waira", 2], ["jazmin", 3], ["alonso", 4]]);
  const columns = buildWeeklyCloseColumns([alonso, jazmin, waira, adrian, itzel], storeTotal, null, null, rdvOrder);
  assert.deepEqual(columns.map((column) => column.name), ["Itzel", "Adrián", "Waira", "Jazmín", "Alonso"]);
});

test("quien no está en el orden RDV va al final por rol y nombre", () => {
  const nuevo = member({ userId: "nuevo", userName: "Bruno", sales: 5, transactions: 1, pieces: 1 });
  const rdvOrder = new Map([["waira", 0], ["jazmin", 1]]);
  const columns = buildWeeklyCloseColumns([nuevo, jazmin, waira], storeTotal, null, null, rdvOrder);
  assert.deepEqual(columns.map((column) => column.name), ["Waira", "Jazmín", "Bruno"]);
});

test("encabezados usan solo el primer nombre en formato título", () => {
  assert.equal(firstName("WAIRA ZITLALI POPOCA"), "Waira");
  assert.equal(firstName("jazmín castro"), "Jazmín");
  assert.equal(firstName("  Alonso Treviño "), "Alonso");
  const full = member({ userId: "w2", userName: "WAIRA ZITLALI POPOCA", sales: 100, transactions: 1, pieces: 1 });
  assert.equal(buildWeeklyCloseColumn(full, storeTotal).name, "Waira");
});

test("miembro sin datos de la semana sale con ceros y SIN DATOS", () => {
  const vacaciones = member({ userId: "v1", userName: "Adrián Hernández", role: "SUBGERENTE" });
  const column = buildWeeklyCloseColumn(vacaciones, storeTotal);
  assert.equal(column.name, "Adrián");
  assert.equal(column.sales, 0);
  assert.equal(column.goal, 0);
  assert.equal(column.transactions, 0);
  assert.equal(column.focus, "SIN DATOS");
});
