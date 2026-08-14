import assert from "node:assert/strict";
import test from "node:test";
import { buildManagerDashboardMetric } from "../lib/retool-manager-dashboard";

test("calcula los indicadores gerenciales desde datos crudos", () => {
  assert.deepEqual(
    buildManagerDashboardMetric({ sales: 12_500, goal: 10_000, transactions: 10, pieces: 15, traffic: 40 }),
    {
      sales: 12_500,
      goal: 10_000,
      transactions: 10,
      pieces: 15,
      traffic: 40,
      achievement: 125,
      remaining: 0,
      upt: 1.5,
      aur: 833.33,
      ept: 1250,
      conversion: 25
    }
  );
});

test("sin divisores muestra ausencia de dato, no ceros inventados", () => {
  assert.deepEqual(
    buildManagerDashboardMetric({ sales: 0, goal: 0, transactions: 0, pieces: 0, traffic: null }),
    {
      sales: 0,
      goal: 0,
      transactions: 0,
      pieces: 0,
      traffic: null,
      achievement: null,
      remaining: 0,
      upt: null,
      aur: null,
      ept: null,
      conversion: null
    }
  );
});

