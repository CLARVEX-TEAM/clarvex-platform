import assert from "node:assert/strict";
import test from "node:test";
import type { AppData } from "../lib/app-data";
import { buildUserDashboardKpi } from "../lib/dashboard-kpi";
import { buildDesktopSummary } from "../lib/escritorio-resumen";
import type { Kpi, Pending, User } from "../lib/types";

const today = "2026-11-13";
const person = (id: string, extra?: Partial<User>): User => ({
  id, name: id, role: "ASESOR", employeeNumber: id, avatar: "AA", ...extra
});
const row = (userId: string, extra?: Partial<Kpi>): Kpi => ({
  userId, date: today, dailySales: 0, monthlySales: 0, dailyGoal: 100, monthlyGoal: 0,
  avgTicket: 0, upt: 0, conversion: null, traffic: null, pieces: 0, transactions: 0,
  ranking: 0, grossSales: null, discountAmount: null, discountMargin: null, discountLimit: null,
  commissionAmount: 0, commissionPercent: 0, ...extra
});
const empty = (): AppData => ({
  dashboardDaily: buildUserDashboardKpi(today, null),
  users: [], kpis: [], plans: [], pendings: [], announcements: [], schedules: [],
  logEntries: [], evidences: [], commissionRules: [], commissionBasis: "MINIMO"
});

test("una meta precargada no muestra venta cero ni genera un día de tendencia", () => {
  const data = empty();
  data.users = [person("Elena")];
  data.kpis = [row("Elena")];
  data.dashboardDaily.dailyGoal = 100;
  const result = buildDesktopSummary(data);
  assert.equal(result.sales, null);
  assert.equal(result.transactions, null);
  assert.equal(result.avgTicket, null);
  assert.equal(result.ranking[0].sales, null);
  assert.equal(result.ranking[0].followUp, false);
  assert.deepEqual(result.trend, []);
});

test("un neto cero con movimiento sigue siendo venta y los divisores ausentes se muestran sin valor", () => {
  const data = empty();
  data.dashboardDaily = buildUserDashboardKpi(today, { dailyGoal: 100, dailySales: 0, pieces: 0, transactions: 2, traffic: null });
  const result = buildDesktopSummary(data);
  assert.equal(result.sales, 0);
  assert.equal(result.avgTicket, 0);
  assert.equal(result.upt, 0);
  assert.equal(result.aur, null);
  assert.equal(result.conversion, null);
});

test("la tendencia conserva metas del día capturado y excluye metas aisladas y fechas futuras", () => {
  const data = empty();
  data.kpis = [
    row("Elena", { date: "2026-11-11", dailySales: -15 }),
    row("Mateo", { date: "2026-11-11", dailyGoal: 50 }),
    row("Elena", { date: "2026-11-12" }),
    row("Mateo", { date: "2026-11-14", dailySales: 25 }),
  ];
  assert.deepEqual(buildDesktopSummary(data).trend, [{ date: "2026-11-11", label: "11", sales: -15, goal: 150 }]);
});

test("seguimiento solo para asesores laborando con captura y alcance menor al umbral", () => {
  const data = empty();
  data.users = [person("Elena"), person("Mateo"), person("Lucía"), person("Kiosco", { checklistOnly: true })];
  data.kpis = [row("Elena", { dailySales: 40 }), row("Mateo", { dailySales: 20 }), row("Lucía", { dailySales: 95 })];
  data.schedules = [{ id: "off", userId: "Mateo", date: today, status: "OFF", day: "", start: "", end: "", zone: "" }];
  assert.deepEqual(buildDesktopSummary(data).ranking.map(r => [r.advisor.id, r.followUp]), [
    ["Lucía", false], ["Elena", true], ["Mateo", false]
  ]);
});

test("atención usa solo abiertos, actividades publicadas vencidas y lecturas de asesores activos", () => {
  const data = empty();
  data.users = [person("Elena"), person("Mateo"), person("Gerencia", { role: "GERENTE" }), person("Baja", { active: false })];
  const pending: Pending = { id: "p1", title: "Apertura", description: "", category: "operacion", priority: "critica", ownerId: "Elena", status: "pendiente", dueDate: "2026-11-12" };
  data.pendings = [pending, { ...pending, id: "p2", status: "completado" }];
  const plan = { id: "plan", userId: "Elena", date: "2026-11-12", dailyGoal: 0, focus: "", message: "", published: true,
    activities: [{ id: "abierta", title: "Abrir", completed: false }, { id: "hecha", title: "Hecha", completed: true }] };
  data.plans = [plan, { ...plan, id: "borrador", published: false }, { ...plan, id: "hoy", date: today }];
  data.announcements = [{ id: "c1", title: "Aviso", body: "", authorId: "Gerencia", date: today, readBy: ["Elena", "Gerencia"], reactions: [] }];
  const result = buildDesktopSummary(data);
  assert.deepEqual(result.priority.map(item => [item.id, item.overdue]), [["p1", true]]);
  assert.deepEqual(result.overdueActivities.map(item => item.id), ["abierta"]);
  assert.equal(result.unconfirmed[0].remaining, 1);
});
