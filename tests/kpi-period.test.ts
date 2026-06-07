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

test("deduplica el trafico de tienda por fecha", () => {
  const traffic = aggregateStoreTraffic([
    { date: new Date("2026-06-01T00:00:00.000Z"), traffic: 100 },
    { date: new Date("2026-06-01T00:00:00.000Z"), traffic: 100 },
    { date: new Date("2026-06-02T00:00:00.000Z"), traffic: 120 }
  ]);
  assert.equal(traffic, 220);
});
