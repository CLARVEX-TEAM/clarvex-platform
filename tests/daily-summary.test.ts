import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAdvisorMessage,
  buildGoalReachedMessage,
  buildManagerSummary,
  buildMiddayAdvisorMessage,
  buildMiddayManagerSummary,
  buildMorningAdvisorMessage,
  buildMorningManagerSummary,
  buildWeeklyAdvisorMessage,
  buildWeeklyManagerSummary,
  firstName,
  resolveDailyCase,
  selectMorningMotivation,
  weeklyComparisonLine
} from "../lib/daily-summary";
import { retailWeekRange } from "../lib/cron-time";

test("usa solo el primer nombre del asesor", () => {
  assert.equal(firstName("WAIRA ZITLALI POPOCA"), "WAIRA");
  assert.equal(firstName("  Juan  "), "Juan");
});

test("selecciona el caso correcto segun venta y alcance", () => {
  assert.equal(resolveDailyCase(0, 0), "F"); // sin ventas
  assert.equal(resolveDailyCase(100, 120), "A"); // > 115%
  assert.equal(resolveDailyCase(100, 115), "B"); // 115% exacto cae en B
  assert.equal(resolveDailyCase(100, 100), "B"); // 100% exacto
  assert.equal(resolveDailyCase(100, 99), "C"); // 80-99
  assert.equal(resolveDailyCase(100, 80), "C"); // 80% exacto
  assert.equal(resolveDailyCase(100, 79), "D"); // 50-79
  assert.equal(resolveDailyCase(100, 50), "D"); // 50% exacto
  assert.equal(resolveDailyCase(100, 49), "E"); // < 50
});

test("caso F cuando venta es 0 aunque el alcance calculado fuera alto", () => {
  const message = buildAdvisorMessage({ name: "Ana Lopez", sales: 0, goal: 0 });
  assert.equal(message.case, "F");
  assert.match(message.body, /no se registraron ventas a tu nombre/);
});

test("formatea venta y diferencia como pesos sin decimales y redondea alcance", () => {
  const message = buildAdvisorMessage({ name: "Carlos", sales: 8000, goal: 10000 });
  assert.equal(message.case, "C");
  assert.equal(message.achievement, 80);
  assert.match(message.body, /\$8,000/);
  assert.match(message.body, /\$2,000/); // diferencia para llegar al 100%
});

test("resumen de cierre de gerencia calcula alcance de tienda y conteos", () => {
  const summary = buildManagerSummary({
    dateLabel: "13 de junio",
    storeSales: 90000,
    storeGoal: 100000,
    overGoal: 3,
    near: 1,
    below: 2
  });
  assert.match(summary.body, /Resumen de cierre — 13 de junio/);
  assert.match(summary.body, /Alcance: 90%/);
  assert.match(summary.body, /Sobre meta: 3 asesores/);
  assert.match(summary.body, /Cerca: 1 asesores/);
  assert.match(summary.body, /Abajo: 2 asesores/);
});

test("mensaje motivacional matutino prioriza lunes y viernes sobre el alcance", () => {
  // Lunes (weekday 1) gana aunque el alcance sea bajo
  assert.match(
    selectMorningMotivation({ name: "Luis", weekday: 1, weeklyGoal: 50000, remaining: 50000, achievementPct: 10 }),
    /¡Feliz lunes Luis!/
  );
  // Viernes (weekday 5)
  assert.match(
    selectMorningMotivation({ name: "Luis", weekday: 5, weeklyGoal: 50000, remaining: 12000, achievementPct: 60 }),
    /¡Es viernes Luis!/
  );
  // Día normal con alcance alto
  assert.match(
    selectMorningMotivation({ name: "Luis", weekday: 3, weeklyGoal: 50000, remaining: 5000, achievementPct: 90 }),
    /¡Vas excelente!/
  );
  // Día normal con alcance medio
  assert.match(
    selectMorningMotivation({ name: "Luis", weekday: 3, weeklyGoal: 50000, remaining: 25000, achievementPct: 60 }),
    /hoy hay que acelerar/
  );
  // Día normal con alcance bajo
  assert.match(
    selectMorningMotivation({ name: "Luis", weekday: 3, weeklyGoal: 50000, remaining: 45000, achievementPct: 20 }),
    /día clave para remontar/
  );
});

test("mensaje matutino muestra meta del día, acumulado y faltante", () => {
  const message = buildMorningAdvisorMessage({
    name: "Marta Ruiz",
    dailyGoal: 5000,
    weeklySales: 30000,
    weeklyGoal: 50000,
    weekday: 3
  });
  assert.match(message.body, /¡Buenos días Marta!/);
  assert.match(message.body, /Tu meta de hoy es \$5,000/);
  assert.match(message.body, /Llevas acumulado esta semana \$30,000/);
  assert.match(message.body, /Te faltan \$20,000 para cumplir tu meta semanal/);
});

test("mensaje matutino felicita cuando ya se cumplio la meta semanal", () => {
  const message = buildMorningAdvisorMessage({
    name: "Marta",
    dailyGoal: 5000,
    weeklySales: 60000,
    weeklyGoal: 50000,
    weekday: 3
  });
  assert.match(message.body, /¡Ya cumpliste tu meta semanal! 🎉/);
});

test("retailWeekRange devuelve la semana retail domingo-sabado que contiene la fecha", () => {
  // 2026-06-13 es sábado -> semana 2026-06-07 (domingo) a 2026-06-13 (sábado)
  const saturday = retailWeekRange(new Date(Date.UTC(2026, 5, 13)));
  assert.equal(saturday.weekStart.toISOString().slice(0, 10), "2026-06-07");
  assert.equal(saturday.weekEnd.toISOString().slice(0, 10), "2026-06-13");
  // Un domingo es el inicio de su propia semana
  const sunday = retailWeekRange(new Date(Date.UTC(2026, 5, 7)));
  assert.equal(sunday.weekStart.toISOString().slice(0, 10), "2026-06-07");
  assert.equal(sunday.weekEnd.toISOString().slice(0, 10), "2026-06-13");
  // Un miércoles cae en la misma semana
  const wednesday = retailWeekRange(new Date(Date.UTC(2026, 5, 10)));
  assert.equal(wednesday.weekStart.toISOString().slice(0, 10), "2026-06-07");
  assert.equal(wednesday.weekEnd.toISOString().slice(0, 10), "2026-06-13");
});

test("celebracion instantanea felicita al cruzar la meta del dia", () => {
  const message = buildGoalReachedMessage({ name: "Waira Popoca", sales: 22500, goal: 22000 });
  assert.match(message.title, /Meta alcanzada/);
  assert.match(message.body, /¡FELICIDADES Waira!/);
  assert.match(message.body, /\$22,500 \(102%\)/);
});

test("empujon de media jornada muestra avance y faltante", () => {
  const message = buildMiddayAdvisorMessage({ name: "Jazmin Castro", sales: 6000, goal: 20000 });
  assert.match(message.body, /¡Vamos Jazmin!/);
  assert.match(message.body, /llevas \$6,000 \(30% de tu meta de hoy\)/);
  assert.match(message.body, /Te faltan \$14,000/);
});

test("resumen de media jornada lista atrasados o confirma ritmo", () => {
  const conAtrasados = buildMiddayManagerSummary({
    dateLabel: "13 de junio",
    storeSales: 40000,
    storeGoal: 100000,
    thresholdPct: 50,
    behind: [{ name: "Jazmin Castro", sales: 6000, goal: 20000 }]
  });
  assert.match(conAtrasados.body, /Media jornada — 13 de junio/);
  assert.match(conAtrasados.body, /atrasados \(< 50%\)/);
  assert.match(conAtrasados.body, /• Jazmin: \$6,000 \(30%\)/);

  const sinAtrasados = buildMiddayManagerSummary({ dateLabel: "13 de junio", storeSales: 90000, storeGoal: 100000, thresholdPct: 50, behind: [] });
  assert.match(sinAtrasados.body, /Todo el equipo va en ritmo \(≥ 50%\)/);
});

test("comparativo semanal sube, baja o se mantiene segun la semana anterior", () => {
  assert.match(weeklyComparisonLine(120, 100) ?? "", /\+20% vs la semana pasada/);
  assert.match(weeklyComparisonLine(80, 100) ?? "", /-20% vs la semana pasada/);
  assert.match(weeklyComparisonLine(100, 100) ?? "", /Mismo nivel/);
  assert.equal(weeklyComparisonLine(100, 0), null); // sin base de comparación
});

test("el #1 con venta recibe felicitacion de lider de la semana", () => {
  const message = buildWeeklyAdvisorMessage({ name: "Alonso Treviño", sales: 51970, goal: 50000, rank: 1, prevSales: 45000 });
  assert.match(message.title, /Líder de la semana/);
  assert.match(message.body, /¡Eres el LÍDER de la semana, Alonso!/);
  assert.match(message.body, /quedaste #1 del equipo/);
});

test("mensaje semanal de un asesor no-lider muestra venta, alcance, ranking y comparativo", () => {
  const message = buildWeeklyAdvisorMessage({ name: "Waira Popoca", sales: 48000, goal: 50000, rank: 2, prevSales: 45000 });
  assert.match(message.body, /Cierre de semana, Waira/);
  assert.match(message.body, /Vendiste \$48,000 de tu meta \$50,000 \(96%\)/);
  assert.match(message.body, /lugar #2 del equipo/);
  assert.match(message.body, /vs la semana pasada/);
});

test("el #1 sin ventas no recibe mensaje de lider", () => {
  const message = buildWeeklyAdvisorMessage({ name: "Ana", sales: 0, goal: 50000, rank: 1, prevSales: 0 });
  assert.doesNotMatch(message.body, /LÍDER/);
  assert.match(message.body, /Cierre de semana, Ana/);
});

test("resumen semanal de gerencia incluye Top del equipo y comparativo", () => {
  const summary = buildWeeklyManagerSummary({
    rangeLabel: "7 jun - 13 jun",
    storeSales: 140686,
    storeGoal: 280000,
    prevStoreSales: 120000,
    top: [{ name: "Alonso Treviño", sales: 51970 }, { name: "Waira Popoca", sales: 48575 }]
  });
  assert.match(summary.body, /Resumen semanal — 7 jun - 13 jun/);
  assert.match(summary.body, /Venta de tienda: \$140,686 de \$280,000 \(50%\)/);
  assert.match(summary.body, /🏆 Líder de la semana: Alonso — \$51,970/);
  assert.match(summary.body, /1\. Alonso — \$51,970/);
  assert.match(summary.body, /2\. Waira — \$48,575/);
});

test("resumen matutino de gerencia calcula alcance semanal y faltante", () => {
  const summary = buildMorningManagerSummary({
    dateLabel: "13 de junio",
    storeDailyGoal: 20000,
    storeWeeklySales: 80000,
    storeWeeklyGoal: 100000,
    activeAdvisors: 4
  });
  assert.match(summary.body, /Arranque del día 13 de junio/);
  assert.match(summary.body, /Meta de tienda hoy: \$20,000/);
  assert.match(summary.body, /Venta acumulada esta semana: \$80,000/);
  assert.match(summary.body, /Alcance semanal: 80%/);
  assert.match(summary.body, /Faltante para meta semanal: \$20,000/);
  assert.match(summary.body, /Equipo activo hoy: 4 asesores/);
});
