import assert from "node:assert/strict";
import test from "node:test";
import { buildWeekHistory, percentDelta } from "../lib/kpi-history";

const user = { name: "Itzel", role: "ASESOR" as const, photoUrl: null };
const other = { name: "Waira", role: "ASESOR" as const, photoUrl: null };

function row(overrides: {
  userId: string; date: string; weekNumber: number; weekStart: string; weekEnd: string;
  sales?: number; goal?: number; transactions?: number; pieces?: number; traffic?: number | null;
  user?: typeof user;
}) {
  return {
    userId: overrides.userId,
    date: new Date(`${overrides.date}T00:00:00.000Z`),
    weekNumber: overrides.weekNumber,
    weekStart: new Date(`${overrides.weekStart}T00:00:00.000Z`),
    weekEnd: new Date(`${overrides.weekEnd}T00:00:00.000Z`),
    dailySales: overrides.sales ?? 0,
    dailyGoal: overrides.goal ?? 0,
    transactions: overrides.transactions ?? 0,
    pieces: overrides.pieces ?? 0,
    conversion: null,
    traffic: overrides.traffic ?? null,
    grossSales: null,
    discountAmount: null,
    discountLimit: null,
    commissionAmount: 0,
    commissionPercent: 0,
    user: overrides.user ?? user
  };
}

const rows = [
  // Semana 24: dos asesores
  row({ userId: "u1", date: "2026-06-08", weekNumber: 24, weekStart: "2026-06-07", weekEnd: "2026-06-13", sales: 1000, goal: 800, transactions: 10, pieces: 20, traffic: 100 }),
  row({ userId: "u2", date: "2026-06-08", weekNumber: 24, weekStart: "2026-06-07", weekEnd: "2026-06-13", sales: 500, goal: 700, transactions: 5, pieces: 5, traffic: 100, user: other }),
  // Semana 25: solo u1
  row({ userId: "u1", date: "2026-06-15", weekNumber: 25, weekStart: "2026-06-14", weekEnd: "2026-06-20", sales: 2000, goal: 900, transactions: 8, pieces: 24, traffic: 150 })
];

test("histórico de tienda: agrega por semana y ordena ascendente", () => {
  const weeks = buildWeekHistory(rows);
  assert.equal(weeks.length, 2);
  assert.equal(weeks[0].weekNumber, 24);
  assert.equal(weeks[0].sales, 1500);
  assert.equal(weeks[0].goal, 1500);
  assert.equal(weeks[0].transactions, 15);
  assert.equal(weeks[1].weekNumber, 25);
  assert.equal(weeks[1].sales, 2000);
  assert.equal(weeks[1].upt, 3); // 24 piezas / 8 tickets
});

test("histórico personal: solo los números del asesor", () => {
  const weeks = buildWeekHistory(rows, "u1");
  assert.equal(weeks[0].sales, 1000);
  assert.equal(weeks[0].transactions, 10);
  // u2 no aparece aunque esté en las filas
  const weeksU2 = buildWeekHistory(rows, "u2");
  assert.equal(weeksU2.length, 1); // solo semana 24
  assert.equal(weeksU2[0].sales, 500);
});

test("ignora filas sin semana retail asignada", () => {
  const legacy = { ...rows[0], weekNumber: null, weekStart: null, weekEnd: null };
  const weeks = buildWeekHistory([legacy, rows[2]]);
  assert.equal(weeks.length, 1);
  assert.equal(weeks[0].weekNumber, 25);
});

test("filas con weekStart guardado por día se fusionan en una sola semana", () => {
  // Regresión: en producción hay filas con weekStart=weekEnd=su propia fecha
  // (p.ej. "4 jul – 4 jul"); deben agruparse por la semana retail de la fecha.
  const fragmented = [
    row({ userId: "u1", date: "2026-06-28", weekNumber: 26, weekStart: "2026-06-28", weekEnd: "2026-06-28", sales: 92_509, goal: 80_000, transactions: 10, pieces: 15 }),
    row({ userId: "u1", date: "2026-07-01", weekNumber: 26, weekStart: "2026-07-01", weekEnd: "2026-07-01", sales: 40_461, goal: 15_000, transactions: 8, pieces: 12 }),
    row({ userId: "u1", date: "2026-07-04", weekNumber: 26, weekStart: "2026-07-04", weekEnd: "2026-07-04", sales: 27_152, goal: 50_000, transactions: 6, pieces: 9 })
  ];
  const weeks = buildWeekHistory(fragmented);
  assert.equal(weeks.length, 1);
  assert.equal(weeks[0].weekNumber, 26);
  assert.equal(weeks[0].weekStart, "2026-06-28"); // domingo
  assert.equal(weeks[0].weekEnd, "2026-07-04");   // sábado
  assert.equal(weeks[0].sales, 160_122);
  assert.equal(weeks[0].transactions, 24);
});

test("percentDelta: variación con 1 decimal y null si no es comparable", () => {
  assert.equal(percentDelta(110, 100), 10);
  assert.equal(percentDelta(95, 100), -5);
  assert.equal(percentDelta(100, 0), null);
  assert.equal(percentDelta(null, 100), null);
  assert.equal(percentDelta(100, null), null);
});
