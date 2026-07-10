import assert from "node:assert/strict";
import test from "node:test";
import { buildAiKpiSnapshot } from "../lib/kpi-report";

test("buildAiKpiSnapshot: no suma el tráfico duplicado por fila (conversión de tienda)", () => {
  const day = new Date("2026-07-09T00:00:00.000Z");
  const baseUser = { photoUrl: null as string | null };
  const rows = [
    { userId: "waira", date: day, dailySales: 8000, dailyGoal: 7000, transactions: 20, pieces: 40, conversion: null, traffic: 600, user: { ...baseUser, name: "Waira", role: "ASESOR" as const } },
    { userId: "jazmin", date: day, dailySales: 7000, dailyGoal: 7000, transactions: 25, pieces: 45, conversion: null, traffic: 600, user: { ...baseUser, name: "Jazmin", role: "ASESOR" as const } },
    { userId: "alonso", date: day, dailySales: 5000, dailyGoal: 7000, transactions: 15, pieces: 25, conversion: null, traffic: 600, user: { ...baseUser, name: "Alonso", role: "ASESOR" as const } }
  ];

  const { store, advisors, traffic } = buildAiKpiSnapshot(rows);

  // Bug viejo: sumaba 600*3=1800 → conversión 3.3%. Correcto: tráfico 600 → 10%.
  assert.equal(traffic, 600);
  assert.equal(store?.transactions, 60);
  assert.equal(store?.conversion, 10);
  assert.notEqual(store?.conversion, Math.round((60 / 1800) * 10000) / 100);

  const waira = advisors.find((a) => a.userName === "Waira");
  assert.ok(waira);
  assert.equal(waira.conversion, Math.round((20 / 600) * 10000) / 100);
  assert.equal(waira.conversion, 3.33);
});

test("buildAiKpiSnapshot: periodo suma tráfico por día y conversión de asesor como en KPIs", () => {
  const d1 = new Date("2026-07-08T00:00:00.000Z");
  const d2 = new Date("2026-07-09T00:00:00.000Z");
  const baseUser = { photoUrl: null as string | null };
  const rows = [
    { userId: "waira", date: d1, dailySales: 4000, dailyGoal: 4000, transactions: 10, pieces: 20, conversion: null, traffic: 500, user: { ...baseUser, name: "Waira", role: "ASESOR" as const } },
    { userId: "waira", date: d2, dailySales: 5000, dailyGoal: 4000, transactions: 15, pieces: 30, conversion: null, traffic: 700, user: { ...baseUser, name: "Waira", role: "ASESOR" as const } },
    { userId: "mgr", date: d2, dailySales: 0, dailyGoal: 0, transactions: 0, pieces: 0, conversion: null, traffic: 700, user: { ...baseUser, name: "Gerente", role: "GERENTE" as const } }
  ];

  const { store, advisors, traffic } = buildAiKpiSnapshot(rows);
  assert.equal(traffic, 1200); // 500 + 700, no 500+700+700
  assert.equal(store?.transactions, 25);
  assert.equal(store?.conversion, Math.round((25 / 1200) * 10000) / 100);

  assert.equal(advisors.length, 1);
  assert.equal(advisors[0].conversion, Math.round((25 / 1200) * 10000) / 100);
});
