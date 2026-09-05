import assert from "node:assert/strict";
import test from "node:test";
import { buildStoreAudit } from "../lib/retool-store-audit";
import { buildManagerDashboardMetric } from "../lib/retool-manager-dashboard";

const metrica = (sales: number, goal: number) =>
  buildManagerDashboardMetric({ sales, goal, transactions: 10, pieces: 20, traffic: 100 });

/** Lo minimo para construir la auditoria sin que salte nada mas. */
function auditar(extra: Partial<Parameters<typeof buildStoreAudit>[0]> = {}) {
  return buildStoreAudit({
    store: { id: "s1", name: "TIENDA", kpisEnabled: true },
    today: metrica(1000, 1000),
    month: metrica(6000, 35000),
    latestKpiDate: "2026-09-04",
    daysSinceKpi: 0,
    todayKpiRows: 5,
    activeAdvisors: 4,
    workingToday: 3,
    attendanceIssues: 0,
    highPriorityPendings: 0,
    pendingShiftRequests: 0,
    openInventoryRounds: 0,
    advisorsWorkingWithoutGoal: 0,
    ...extra
  });
}

const titulos = (b: ReturnType<typeof buildStoreAudit>) => b.anomalies.map((a) => a.title);

test("⚠️ REGRESION: el dia 6 de un mes de 35 no es atraso", () => {
  /*
   * El fallo: el ritmo se medía contra la meta del mes ENTERO. Con $6,000
   * vendidos y una meta mensual de $35,000, el avance daba 17 % y la anomalía
   * «Mes por debajo del ritmo» saltaba siempre al principio del mes.
   *
   * Aqui la tienda va EXACTAMENTE en meta: 6 dias a $1,000, meta acumulada
   * $6,000. No hay atraso que reportar.
   */
  const brief = auditar({
    month: metrica(6000, 35000),
    monthPace: { salesToDate: 6000, goalToDate: 6000, elapsedDays: 6, totalDays: 35, capturedDays: 6 }
  });
  assert.ok(!titulos(brief).includes("Mes por debajo del ritmo"), JSON.stringify(titulos(brief)));
});

test("un atraso REAL contra la meta acumulada si se reporta", () => {
  // 6 dias, meta acumulada $6,000, vendidos $4,000: 66.7 %. Eso si es atraso.
  const brief = auditar({
    month: metrica(4000, 35000),
    monthPace: { salesToDate: 4000, goalToDate: 6000, elapsedDays: 6, totalDays: 35, capturedDays: 6 }
  });
  const anomalia = brief.anomalies.find((a) => a.title === "Mes por debajo del ritmo");
  assert.ok(anomalia, "deberia reportarse");
  assert.match(anomalia.detail, /66\.7 %/);
  assert.match(anomalia.detail, /6 días transcurridos/);
  assert.match(anomalia.detail, /de 35 del mes retail/);
});

test("⚠️ con captura INCOMPLETA no se afirma atraso", () => {
  /*
   * Un dia sin capturar baja la venta acumulada y deja la meta igual, asi que
   * se lee identico a una caida de venta. Se dice lo que se sabe: que falta
   * capturar.
   */
  const brief = auditar({
    month: metrica(3000, 35000),
    monthPace: { salesToDate: 3000, goalToDate: 6000, elapsedDays: 6, totalDays: 35, capturedDays: 3 }
  });
  assert.ok(!titulos(brief).includes("Mes por debajo del ritmo"));
  const hueco = brief.anomalies.find((a) => a.title === "Faltan días por capturar en el mes");
  assert.ok(hueco, "tiene que avisar del hueco");
  assert.equal(hueco.severity, "warning");
  assert.match(hueco.detail, /3 de los 6 días/);
});

test("sin `monthPace` no se inventa el ritmo", () => {
  // Preferible callar a emitir la anomalia con el numero equivocado.
  const brief = auditar({ month: metrica(600, 35000) });
  assert.ok(!titulos(brief).includes("Mes por debajo del ritmo"));
  assert.ok(!titulos(brief).includes("Faltan días por capturar en el mes"));
});

test("meta acumulada en CERO no produce un ritmo", () => {
  // Dividir entre cero daria Infinity y se pintaria como un avance enorme.
  const brief = auditar({
    monthPace: { salesToDate: 5000, goalToDate: 0, elapsedDays: 6, totalDays: 35, capturedDays: 6 }
  });
  assert.ok(!titulos(brief).includes("Mes por debajo del ritmo"));
});

test("el primer dia del mes, con captura, no reporta hueco", () => {
  const brief = auditar({
    monthPace: { salesToDate: 1000, goalToDate: 1000, elapsedDays: 1, totalDays: 35, capturedDays: 1 }
  });
  assert.ok(!titulos(brief).includes("Faltan días por capturar en el mes"));
});

test("un mes que aun no empieza no reporta nada de ritmo", () => {
  const brief = auditar({
    monthPace: { salesToDate: 0, goalToDate: 0, elapsedDays: 0, totalDays: 35, capturedDays: 0 }
  });
  assert.ok(!titulos(brief).includes("Faltan días por capturar en el mes"));
  assert.ok(!titulos(brief).includes("Mes por debajo del ritmo"));
});

/* ─── metas escritas por adelantado ───────────────────────────────────────── */

test("⚠️ REGRESION: con la meta puesta y sin capturar, la anomalia es la CAPTURA", () => {
  /*
   * Guardar Cuota Justa escribe la meta diaria de toda la semana por
   * adelantado, con la venta en cero. A las nueve de la mañana el día tiene
   * meta y no tiene captura, y el cumplimiento sale 0 %.
   *
   * El fallo: eso abría «Venta diaria muy por debajo», CRÍTICA, sobre un día
   * que simplemente no se había capturado todavía; y «Sin KPIs capturados hoy»
   * no saltaba, porque la fila existía. Se avisaba de lo que no era y se
   * callaba lo que sí.
   *
   * `todayKpiRows` cuenta ahora filas con captura de verdad (ver `tieneCaptura`
   * en `lib/retool-store-agent.ts`), así que llega en cero.
   */
  const brief = auditar({ today: metrica(0, 12000), todayKpiRows: 0 });
  const lista = titulos(brief);
  assert.ok(lista.includes("Sin KPIs capturados hoy"), JSON.stringify(lista));
  assert.ok(!lista.includes("Venta diaria muy por debajo"), JSON.stringify(lista));
});

test("con el dia ya capturado, una venta hundida SI se reporta", () => {
  // El freno de arriba no puede tapar el caso real: si hay captura y la venta
  // va al 30 % de la meta, eso es exactamente lo que hay que decir.
  const brief = auditar({ today: metrica(3600, 12000), todayKpiRows: 5 });
  assert.ok(titulos(brief).includes("Venta diaria muy por debajo"), JSON.stringify(titulos(brief)));
});

test("el aviso de trafico tampoco salta con un dia sin capturar", () => {
  const sinTrafico = buildManagerDashboardMetric({ sales: 0, goal: 12000, transactions: 0, pieces: 0, traffic: null });
  const brief = auditar({ today: sinTrafico, todayKpiRows: 0 });
  assert.ok(!titulos(brief).includes("Tráfico sin capturar"), JSON.stringify(titulos(brief)));
});
