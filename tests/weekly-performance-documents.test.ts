import assert from "node:assert/strict";
import test from "node:test";
import { weeklyReportChanged } from "../lib/weekly-performance-documents";

const report = {
  columns: [],
  store: {
    userId: "store",
    name: "Tienda",
    role: "GERENTE",
    goal: 100,
    sales: 90,
    difference: -10,
    achievement: 90,
    transactions: 1,
    pieces: 1,
    traffic: 10,
    ept: 10,
    lossEpt: 0,
    upt: 1,
    lossUpt: 0,
    aur: 90,
    lossAur: 0,
    tc: 10,
    focus: "AUR",
    waMeta: null,
    waSales: null,
    waTransactions: null,
    waPieces: null
  },
  whatsappBudget: 0
};

test("RDS guardado permanece limpio mientras sus datos no cambien", () => {
  assert.equal(weeklyReportChanged({ report }, structuredClone(report)), false);
});

test("RDS guardado detecta cambios posteriores en ventas", () => {
  const current = structuredClone(report);
  current.store.sales = 120;
  assert.equal(weeklyReportChanged({ report }, current), true);
});

test("RDS sin snapshot se considera distinto del reporte actual", () => {
  assert.equal(weeklyReportChanged(null, report), true);
});
