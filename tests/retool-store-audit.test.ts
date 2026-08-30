import assert from "node:assert/strict";
import test from "node:test";
import { buildManagerDashboardMetric } from "../lib/retool-manager-dashboard";
import { buildStoreAudit } from "../lib/retool-store-audit";

const NOW = new Date("2026-08-30T12:00:00.000Z");
const STORE = { id: "store-1", name: "TH SAN AGUSTIN", kpisEnabled: true };

test("detecta anomalías de tienda sin necesitar datos de otras tiendas", () => {
  const audit = buildStoreAudit({
    generatedAt: NOW,
    store: STORE,
    today: buildManagerDashboardMetric({
      sales: 5_000,
      goal: 10_000,
      transactions: 5,
      pieces: 8,
      traffic: null
    }),
    month: buildManagerDashboardMetric({
      sales: 80_000,
      goal: 120_000,
      transactions: 60,
      pieces: 90,
      traffic: null
    }),
    latestKpiDate: "2026-08-26",
    daysSinceKpi: 4,
    todayKpiRows: 3,
    activeAdvisors: 4,
    workingToday: 2,
    attendanceIssues: 1,
    highPriorityPendings: 2,
    pendingShiftRequests: 1,
    openInventoryRounds: 1,
    draftWeeklyCloses: 1,
    advisorsWorkingWithoutGoal: 1
  });

  assert.equal(audit.storeId, STORE.id);
  assert.equal(audit.storeName, STORE.name);
  assert.equal(audit.summary.status, "attention");
  assert.ok(audit.anomalies.some((item) => item.title === "Captura atrasada"));
  assert.ok(audit.anomalies.some((item) => item.title === "Tráfico sin capturar"));
  assert.ok(audit.anomalies.some((item) => item.title === "Pendientes altos abiertos"));
  assert.equal(audit.anomalies[0]?.severity, "critical");
});

test("devuelve estado sano cuando no hay anomalías", () => {
  const audit = buildStoreAudit({
    generatedAt: NOW,
    store: STORE,
    today: buildManagerDashboardMetric({
      sales: 12_000,
      goal: 10_000,
      transactions: 12,
      pieces: 18,
      traffic: 80
    }),
    month: buildManagerDashboardMetric({
      sales: 140_000,
      goal: 120_000,
      transactions: 120,
      pieces: 180,
      traffic: null
    }),
    latestKpiDate: "2026-08-30",
    daysSinceKpi: 0,
    todayKpiRows: 4,
    activeAdvisors: 4,
    workingToday: 3,
    attendanceIssues: 0,
    highPriorityPendings: 0,
    pendingShiftRequests: 0,
    openInventoryRounds: 0,
    draftWeeklyCloses: 0,
    advisorsWorkingWithoutGoal: 0
  });

  assert.equal(audit.summary.status, "ok");
  assert.equal(audit.summary.score, 100);
  assert.deepEqual(audit.anomalies, []);
});
