import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAgentPeriods,
  transcurrido,
  ventanaEquivalente,
  percentDelta,
  type KpiPeriodRow
} from "../lib/retool-store-agent";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/** Una fila de KPI por dia, con venta constante. */
function ventaConstante(desde: string, hasta: string, importe: number, meta = importe): KpiPeriodRow[] {
  const filas: KpiPeriodRow[] = [];
  for (let cursor = d(desde); cursor <= d(hasta); cursor = new Date(cursor.getTime() + 86_400_000)) {
    filas.push({
      date: new Date(cursor),
      dailySales: importe,
      dailyGoal: meta,
      transactions: 1,
      pieces: 1,
      traffic: 10
    });
  }
  return filas;
}

/* ─── el caso reproducido en la auditoria ─────────────────────────────────── */

const CASO = {
  hoy: d("2026-09-04"),
  mes: { inicio: d("2026-08-30"), fin: d("2026-10-03") },      // 35 dias
  mesAnterior: { inicio: d("2026-08-02"), fin: d("2026-08-29") } // 28 dias
};

function periodosDelCaso() {
  return buildAgentPeriods({
    // Venta constante de $100 diarios en los dos meses.
    rows: [
      ...ventaConstante("2026-08-02", "2026-08-29", 100),
      ...ventaConstante("2026-08-30", "2026-09-04", 100)
    ],
    today: CASO.hoy,
    weekStart: d("2026-08-30"),
    weekEnd: d("2026-09-05"),
    retailMonthStart: CASO.mes.inicio,
    retailMonthEnd: CASO.mes.fin,
    previousWeekStart: d("2026-08-23"),
    previousWeekEnd: d("2026-08-29"),
    previousMonthStart: CASO.mesAnterior.inicio,
    previousMonthEnd: CASO.mesAnterior.fin,
    beforePreviousMonthStart: d("2026-07-05"),
    beforePreviousMonthEnd: d("2026-08-01")
  });
}

test("⚠️ REGRESION: seis dias del mes no se comparan contra el mes anterior COMPLETO", () => {
  /*
   * El fallo: los dias transcurridos se calculaban con el FIN del periodo, no
   * con la fecha de hoy. Con el mes retail 2026-08-30 a 2026-10-03 la ventana
   * del mes anterior salia de 35 dias, se recortaba a los 28 que tiene, y se
   * comparaba $600 (6 dias capturados) contra $2,800 (28 dias): -78.57 %.
   *
   * Con venta constante de $100 diarios no cayo nada. La respuesta es 0 %.
   */
  const { month } = periodosDelCaso();

  assert.equal(month.toDate.metric.sales, 600, "acumulado hasta hoy: 6 dias x $100");
  assert.equal(month.comparison?.baseline.sales, 600, "la base debe cubrir 6 dias, no 28");
  assert.equal(month.comparison?.salesDeltaPct, 0, "misma venta diaria: la diferencia es cero");

  // Y la prueba de que el calculo viejo daba el numero malo, para que se vea
  // que la correccion no es cosmetica.
  assert.equal(percentDelta(600, 2800), -78.57);
});

test("el rango completo y su META TOTAL se conservan", () => {
  // La meta del mes entero no depende del dia: sigue siendo la de 35 dias con
  // captura. Solo hay filas de 6 dias, asi que la meta capturada son $600.
  const { month } = periodosDelCaso();
  assert.equal(month.start, "2026-08-30");
  assert.equal(month.end, "2026-10-03");
  assert.equal(month.toDate.totalDays, 35);
  assert.equal(month.toDate.elapsedDays, 6);
});

test("la ventana equivalente arranca en el inicio del mes anterior", () => {
  const { month } = periodosDelCaso();
  assert.equal(month.comparison?.start, "2026-08-02");
  assert.equal(month.comparison?.end, "2026-08-07", "6 dias desde el 2 de agosto");
  assert.equal(month.comparison?.equivalent, true);
});

/* ─── dias transcurridos ──────────────────────────────────────────────────── */

test("transcurrido cuenta el dia de hoy", () => {
  const t = transcurrido(d("2026-08-30"), d("2026-10-03"), d("2026-09-04"));
  assert.equal(t.dias, 6);
  assert.equal(t.diasTotales, 35);
  assert.equal(t.terminado, false);
  assert.equal(t.hasta.toISOString().slice(0, 10), "2026-09-04");
});

test("un periodo ya terminado cuenta sus dias completos", () => {
  const t = transcurrido(d("2026-08-02"), d("2026-08-29"), d("2026-09-04"));
  assert.equal(t.dias, 28);
  assert.equal(t.terminado, true);
  assert.equal(t.hasta.toISOString().slice(0, 10), "2026-08-29");
});

test("un periodo que aun no empieza no tiene dias transcurridos", () => {
  const t = transcurrido(d("2026-10-04"), d("2026-10-31"), d("2026-09-04"));
  assert.equal(t.dias, 0);
  assert.equal(t.terminado, false);
});

test("el primer dia del periodo ya cuenta como uno", () => {
  // Si contara cero, el mes empezaria comparando contra una ventana vacia y
  // cualquier venta daria una diferencia infinita.
  const t = transcurrido(d("2026-08-30"), d("2026-10-03"), d("2026-08-30"));
  assert.equal(t.dias, 1);
});

/* ─── meses retail de distinta duracion ───────────────────────────────────── */

test("⚠️ si el mes anterior es MAS CORTO, la ventana se recorta y se avisa", () => {
  /*
   * Los meses retail duran cuatro o cinco semanas. Pedir 35 dias a un mes de 28
   * no se puede: se recorta y `equivalent` queda en false. La comparacion sigue
   * sirviendo de contexto, pero no es una diferencia limpia.
   */
  const v = ventanaEquivalente(d("2026-08-02"), d("2026-08-29"), 35);
  assert.equal(v.dias, 28);
  assert.equal(v.equivalente, false);
  assert.equal(v.fin.toISOString().slice(0, 10), "2026-08-29");
});

test("si cabe entera, es equivalente", () => {
  const v = ventanaEquivalente(d("2026-08-02"), d("2026-08-29"), 6);
  assert.equal(v.dias, 6);
  assert.equal(v.equivalente, true);
});

test("cero dias transcurridos no inventa una ventana", () => {
  const v = ventanaEquivalente(d("2026-08-02"), d("2026-08-29"), 0);
  assert.equal(v.dias, 0);
  assert.equal(v.equivalente, false);
});

/* ─── dias sin captura ────────────────────────────────────────────────────── */

test("⚠️ periodo TERMINADO no es lo mismo que captura COMPLETA", () => {
  /*
   * Un mes puede haber terminado y seguir con dias sin capturar. Mezclarlos
   * hace pasar un hueco de captura por una caida de venta.
   */
  const periodos = buildAgentPeriods({
    // Del 30 de agosto al 4 de septiembre son 6 dias; solo hay 4 capturados.
    rows: ventaConstante("2026-08-30", "2026-09-02", 100),
    today: CASO.hoy,
    weekStart: d("2026-08-30"),
    weekEnd: d("2026-09-05"),
    retailMonthStart: CASO.mes.inicio,
    retailMonthEnd: CASO.mes.fin,
    previousWeekStart: d("2026-08-23"),
    previousWeekEnd: d("2026-08-29"),
    previousMonthStart: CASO.mesAnterior.inicio,
    previousMonthEnd: CASO.mesAnterior.fin,
    beforePreviousMonthStart: d("2026-07-05"),
    beforePreviousMonthEnd: d("2026-08-01")
  });

  assert.equal(periodos.month.toDate.elapsedDays, 6);
  assert.equal(periodos.month.toDate.capturedDays, 4);
  assert.equal(periodos.month.toDate.captureComplete, false);
  assert.equal(periodos.month.toDate.periodEnded, false);
});

test("varias filas del MISMO dia son un solo dia capturado", () => {
  // Hay una fila por persona: cinco filas pueden ser un dia con todo el equipo.
  const unDiaCincoPersonas: KpiPeriodRow[] = Array.from({ length: 5 }, () => ({
    date: d("2026-08-30"),
    dailySales: 100,
    dailyGoal: 100,
    transactions: 1,
    pieces: 1,
    traffic: 10
  }));

  const periodos = buildAgentPeriods({
    rows: unDiaCincoPersonas,
    today: d("2026-08-30"),
    weekStart: d("2026-08-30"),
    weekEnd: d("2026-09-05"),
    retailMonthStart: CASO.mes.inicio,
    retailMonthEnd: CASO.mes.fin,
    previousWeekStart: d("2026-08-23"),
    previousWeekEnd: d("2026-08-29"),
    previousMonthStart: CASO.mesAnterior.inicio,
    previousMonthEnd: CASO.mesAnterior.fin,
    beforePreviousMonthStart: d("2026-07-05"),
    beforePreviousMonthEnd: d("2026-08-01")
  });

  assert.equal(periodos.month.toDate.rowCount, 5);
  assert.equal(periodos.month.toDate.capturedDays, 1);
  assert.equal(periodos.month.toDate.captureComplete, true);
});

/* ─── devoluciones y divisores cero ───────────────────────────────────────── */

test("una venta NEGATIVA por devolucion no rompe la comparacion", () => {
  // La venta del dia puede ser negativa: una devolucion sin otra venta que la
  // compense deja el dia en rojo, y asi se registra.
  assert.equal(percentDelta(-50, 100), -150);
  // Mejorar desde una base negativa se lee como mejora, que es lo correcto.
  assert.equal(percentDelta(-50, -100), 50);
});

test("una base en CERO no produce un porcentaje inventado", () => {
  // Dividir entre cero daria Infinity y se pintaria como un crecimiento.
  assert.equal(percentDelta(500, 0), null);
  assert.equal(percentDelta(0, 0), null);
});

test("sin meta capturada, el alcance es nulo y no cero", () => {
  const periodos = buildAgentPeriods({
    rows: ventaConstante("2026-08-30", "2026-09-04", 100, 0),
    today: CASO.hoy,
    weekStart: d("2026-08-30"),
    weekEnd: d("2026-09-05"),
    retailMonthStart: CASO.mes.inicio,
    retailMonthEnd: CASO.mes.fin,
    previousWeekStart: d("2026-08-23"),
    previousWeekEnd: d("2026-08-29"),
    previousMonthStart: CASO.mesAnterior.inicio,
    previousMonthEnd: CASO.mesAnterior.fin,
    beforePreviousMonthStart: d("2026-07-05"),
    beforePreviousMonthEnd: d("2026-08-01")
  });
  assert.equal(periodos.month.toDate.metric.achievement, null);
});
