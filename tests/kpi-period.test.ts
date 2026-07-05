import assert from "node:assert/strict";
import test from "node:test";
import { buildRetailMonths, periodDateKey } from "../lib/kpi-period";
import { aggregateKpis, aggregateStore, aggregateStoreTraffic } from "../lib/kpi-report";

test("construye junio retail desde el inicio de la semana RDV", () => {
  const [range] = buildRetailMonths([
    { weekStart: new Date("2026-05-31T00:00:00.000Z"), weekEnd: new Date("2026-06-06T00:00:00.000Z") },
    { weekStart: new Date("2026-06-28T00:00:00.000Z"), weekEnd: new Date("2026-06-30T00:00:00.000Z") }
  ]);
  assert.equal(range.label, "Junio 2026");
  assert.equal(periodDateKey(range.start), "2026-05-31");
  assert.equal(periodDateKey(range.end), "2026-06-30");
});

test("acumula ventas, metas y ranking por periodo", () => {
  const base = { conversion: 30, traffic: 100, grossSales: null, discountAmount: null, discountLimit: null, commissionAmount: 0, commissionPercent: 2 };
  const reports = aggregateKpis([
    { ...base, userId: "a", dailySales: 100, dailyGoal: 100, transactions: 2, pieces: 4, user: { name: "Ana", role: "ASESOR", photoUrl: null } },
    { ...base, userId: "a", dailySales: 150, dailyGoal: 100, transactions: 3, pieces: 6, user: { name: "Ana", role: "ASESOR", photoUrl: null } },
    { ...base, userId: "b", dailySales: 200, dailyGoal: 200, transactions: 4, pieces: 4, user: { name: "Beto", role: "ASESOR", photoUrl: null } }
  ]);

  assert.equal(reports[0].userId, "a");
  assert.equal(reports[0].sales, 250);
  assert.equal(reports[0].goal, 200);
  assert.equal(reports[0].ranking, 1);
  assert.equal(aggregateStore(reports)?.sales, 450);
});

test("no suma dos veces el mismo usuario y dia calendario", () => {
  const base = { conversion: null, traffic: null, grossSales: null, discountAmount: null, discountLimit: null, commissionAmount: 0, commissionPercent: 0 };
  const reports = aggregateKpis([
    { ...base, id: "legacy", userId: "a", date: new Date("2026-06-05T12:00:00.000Z"), dailySales: 999, dailyGoal: 999, transactions: 9, pieces: 9, user: { name: "Ana", role: "ASESOR", photoUrl: null } },
    { ...base, id: "rdv", userId: "a", date: new Date("2026-06-05T00:00:00.000Z"), dailySales: 100, dailyGoal: 200, transactions: 1, pieces: 2, user: { name: "Ana", role: "ASESOR", photoUrl: null } }
  ]);

  assert.equal(reports[0].sales, 100);
  assert.equal(reports[0].goal, 200);
});

test("sin horarios, el trafico del asesor solo cuenta dias con actividad", () => {
  const base = { conversion: null, grossSales: null, discountAmount: null, discountLimit: null, commissionAmount: 0, commissionPercent: 0, user: { name: "Waira", role: "ASESOR" as const, photoUrl: null } };
  const reports = aggregateKpis([
    // Día trabajado con venta: su tráfico sí cuenta.
    { ...base, userId: "w", date: new Date("2026-06-29T00:00:00.000Z"), dailySales: 1000, dailyGoal: 800, transactions: 5, pieces: 8, traffic: 1614 },
    // Día de descanso: registro con meta pero sin venta ni tickets — el
    // tráfico de la tienda ese día no infla su conversión.
    { ...base, userId: "w", date: new Date("2026-06-30T00:00:00.000Z"), dailySales: 0, dailyGoal: 800, transactions: 0, pieces: 0, traffic: 192 }
  ]);
  assert.equal(reports[0].traffic, 1614);
  assert.equal(reports[0].conversion, Math.round((5 / 1614) * 100 * 100) / 100);
});

test("con horarios, el trafico del asesor son sus dias laborados (HORARIOS)", () => {
  const base = { conversion: null, grossSales: null, discountAmount: null, discountLimit: null, commissionAmount: 0, commissionPercent: 0, user: { name: "Waira", role: "ASESOR" as const, photoUrl: null } };
  const rows = [
    // Laboró y vendió.
    { ...base, userId: "w", date: new Date("2026-06-29T00:00:00.000Z"), dailySales: 1000, dailyGoal: 800, transactions: 5, pieces: 8, traffic: 1400 },
    // Laboró pero no vendió (meta sin venta): su tráfico SÍ cuenta.
    { ...base, userId: "w", date: new Date("2026-06-30T00:00:00.000Z"), dailySales: 0, dailyGoal: 800, transactions: 0, pieces: 0, traffic: 214 },
    // Vendió (ej. venta remota) pero NO estaba en horario: no cuenta su tráfico.
    { ...base, userId: "w", date: new Date("2026-07-01T00:00:00.000Z"), dailySales: 500, dailyGoal: 0, transactions: 1, pieces: 1, traffic: 192 }
  ];
  const workingKeys = new Set(["w:2026-06-29", "w:2026-06-30"]);
  const reports = aggregateKpis(rows, false, workingKeys);
  assert.equal(reports[0].traffic, 1614);
});

test("gerencia recibe el trafico completo de la tienda del periodo", () => {
  const base = { conversion: null, grossSales: null, discountAmount: null, discountLimit: null, commissionAmount: 0, commissionPercent: 0 };
  const gerente = { name: "Itzel", role: "GERENTE" as const, photoUrl: null };
  const asesor = { name: "Waira", role: "ASESOR" as const, photoUrl: null };
  const reports = aggregateKpis([
    { ...base, userId: "g", user: gerente, date: new Date("2026-06-29T00:00:00.000Z"), dailySales: 900, dailyGoal: 700, transactions: 3, pieces: 4, traffic: 1400 },
    // La gerente descansó este día, pero el tráfico de tienda igual es suyo.
    { ...base, userId: "w", user: asesor, date: new Date("2026-06-30T00:00:00.000Z"), dailySales: 800, dailyGoal: 700, transactions: 2, pieces: 3, traffic: 629 }
  ]);
  const itzel = reports.find((report) => report.userId === "g");
  assert.equal(itzel?.traffic, 2029);
});

test("deduplica el trafico de tienda por fecha", () => {
  const traffic = aggregateStoreTraffic([
    { date: new Date("2026-06-01T00:00:00.000Z"), traffic: 100 },
    { date: new Date("2026-06-01T00:00:00.000Z"), traffic: 100 },
    { date: new Date("2026-06-02T00:00:00.000Z"), traffic: 120 }
  ]);
  assert.equal(traffic, 220);
});
