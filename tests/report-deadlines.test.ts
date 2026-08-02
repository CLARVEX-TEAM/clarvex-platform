import assert from "node:assert/strict";
import test from "node:test";
import { lastSaturdayOfMonth, lastSaturdayOnOrBefore, reminderFor, retailMonthBoundsFor } from "../lib/report-deadlines";

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const key = (date: Date) => date.toISOString().slice(0, 10);

test("último sábado del mes gregoriano", () => {
  // Julio 2026: el 31 es viernes → el último sábado es el 25.
  assert.equal(key(lastSaturdayOfMonth(2026, 6)), "2026-07-25");
  // Agosto 2026: el 31 es lunes → último sábado, el 29.
  assert.equal(key(lastSaturdayOfMonth(2026, 7)), "2026-08-29");
  // Febrero 2026: el 28 es sábado → ese mismo.
  assert.equal(key(lastSaturdayOfMonth(2026, 1)), "2026-02-28");
});

test("último sábado en o antes de una fecha", () => {
  assert.equal(key(lastSaturdayOnOrBefore(day("2026-08-01"))), "2026-08-01"); // ya es sábado
  assert.equal(key(lastSaturdayOnOrBefore(day("2026-08-02"))), "2026-08-01"); // domingo → el de ayer
  assert.equal(key(lastSaturdayOnOrBefore(day("2026-08-07"))), "2026-08-01"); // viernes
});

test("mes retail: cierra en sábado y puede pasarse del mes gregoriano", () => {
  // Julio 2026 retail va del 5 de julio al 1 de AGOSTO: el cierre no es el 25.
  const julio = retailMonthBoundsFor(day("2026-07-25"));
  assert.equal(key(julio.start), "2026-07-05");
  assert.equal(key(julio.end), "2026-08-01");
  assert.equal(julio.weeks, 4);
});

test("mes retail: detecta los meses de 5 semanas", () => {
  // Junio 2026 retail: 31 may → 4 jul, cinco semanas.
  const junio = retailMonthBoundsFor(day("2026-06-15"));
  assert.equal(junio.weeks, 5);
  assert.equal(key(junio.start), "2026-05-31");
  assert.equal(key(junio.end), "2026-07-04");
  // Septiembre 2026 retail: 30 ago → 3 oct, también cinco.
  assert.equal(retailMonthBoundsFor(day("2026-09-15")).weeks, 5);
  assert.equal(key(retailMonthBoundsFor(day("2026-09-15")).end), "2026-10-03");
});

test("mes retail: cualquier día de la misma semana da el mismo cierre", () => {
  for (const iso of ["2026-07-05", "2026-07-19", "2026-07-25", "2026-07-28", "2026-08-01"]) {
    assert.equal(key(retailMonthBoundsFor(day(iso)).end), "2026-08-01", `falló en ${iso}`);
  }
});

test("NO avisa el último sábado del calendario si el mes retail sigue abierto", () => {
  // El bug reportado: el 25 de julio de 2026 es el último sábado del calendario,
  // pero el mes retail cierra el 1 de agosto. Ese día no toca avisar.
  assert.equal(reminderFor(day("2026-07-25")), null);
  assert.equal(reminderFor(day("2026-07-22")), null);
});

test("avisa 3 días antes del cierre retail, y cada día hasta ese sábado", () => {
  // Cierre de julio retail: sábado 1 de agosto.
  assert.equal(reminderFor(day("2026-07-28")), null);            // 4 días antes: aún no
  assert.equal(reminderFor(day("2026-07-29"))?.daysLeft, 3);
  assert.equal(reminderFor(day("2026-07-30"))?.daysLeft, 2);
  assert.equal(reminderFor(day("2026-07-31"))?.kind, "MES");     // 1 día (y es día de quincena: manda el mes)
  assert.equal(reminderFor(day("2026-08-01"))?.daysLeft, 0);     // el mismo día
  assert.equal(reminderFor(day("2026-08-02")), null);            // ya pasó
});

test("en un mes retail de 5 semanas no avisa el cierre en la semana 4", () => {
  // Junio 2026 retail cierra el 4 de julio. El sábado de la semana 4 es el 27 de
  // junio: ahí no debe avisar el cierre del mes.
  assert.equal(reminderFor(day("2026-06-27")), null);
  // El 30 sí avisa, pero la QUINCENA (último día del mes de nómina), no el cierre.
  assert.equal(reminderFor(day("2026-06-30"))?.kind, "QUINCENA");
  // El aviso del mes arranca el 1 de julio (3 días antes del 4).
  assert.equal(reminderFor(day("2026-07-01"))?.kind, "MES");
  assert.equal(reminderFor(day("2026-07-01"))?.daysLeft, 3);
  assert.equal(reminderFor(day("2026-07-04"))?.daysLeft, 0);
  assert.equal(reminderFor(day("2026-07-04"))?.dueDate, "2026-07-04");
});

test("el aviso del mes dice cuántos días faltan", () => {
  assert.match(reminderFor(day("2026-07-31"))!.message, /en 1 día/);
  assert.match(reminderFor(day("2026-08-01"))!.message, /es HOY/);
  assert.match(reminderFor(day("2026-07-30"))!.message, /Blitz/);
});

test("si el RDV extiende el cierre, el aviso se RETRASA (no adelanta)", () => {
  // Septiembre 2026 retail cierra el sábado 3 de octubre, así que el 1 de octubre
  // toca avisar. Si el RDV dijera que ese mes se estira al 10 de octubre, el
  // aviso espera: es una semana más para capturar, no una menos.
  assert.equal(reminderFor(day("2026-10-01"))?.daysLeft, 2);
  assert.equal(reminderFor(day("2026-10-01"))?.dueDate, "2026-10-03");
  assert.equal(reminderFor(day("2026-10-01"), { rdvMonthEnd: day("2026-10-10") }), null);
});

test("un RDV incompleto NO adelanta el aviso", () => {
  // Solo 4 de las 5 semanas de junio 2026 sincronizadas: el RDV diría que cierra
  // el 27 de junio. Se ignora y sigue mandando la regla (4 de julio) — este es
  // justo el caso que hacía avisar en la semana 4.
  assert.equal(reminderFor(day("2026-06-27"), { rdvMonthEnd: day("2026-06-27") }), null);
  const real = reminderFor(day("2026-07-04"), { rdvMonthEnd: day("2026-06-27") });
  assert.equal(real?.daysLeft, 0);
  assert.equal(real?.dueDate, "2026-07-04");
  assert.equal(real?.source, "CALENDARIO");
});

test("confirmar la entrega deja de avisar por ESE cierre", () => {
  const pendiente = reminderFor(day("2026-07-30"));
  assert.equal(pendiente?.kind, "MES");
  assert.equal(pendiente?.periodKey, "MES-2026-08-01");
  // Con la entrega confirmada, ya no molesta ninguno de los días del rango.
  const confirmado = { confirmedPeriodKeys: ["MES-2026-08-01"] };
  assert.equal(reminderFor(day("2026-07-29"), confirmado), null);
  assert.equal(reminderFor(day("2026-07-30"), confirmado), null);
  assert.equal(reminderFor(day("2026-08-01"), confirmado), null);
});

test("confirmar un cierre no silencia el siguiente", () => {
  // Confirmado julio (cierra el 1 de agosto), agosto retail cierra el 29.
  const confirmado = { confirmedPeriodKeys: ["MES-2026-08-01"] };
  const agosto = reminderFor(day("2026-08-29"), confirmado);
  assert.equal(agosto?.kind, "MES");
  assert.equal(agosto?.periodKey, "MES-2026-08-29");
});

test("avisa el cierre de quincena (día 15 y último del mes)", () => {
  assert.equal(reminderFor(day("2026-07-15"))?.kind, "QUINCENA");
  assert.equal(reminderFor(day("2026-07-15"))?.periodKey, "QUINCENA-2026-07-15");
  assert.equal(reminderFor(day("2026-08-31"))?.kind, "QUINCENA");
  assert.match(reminderFor(day("2026-07-15"))!.message, /faltas/);
});

test("la quincena confirmada tampoco vuelve a avisar", () => {
  assert.equal(reminderFor(day("2026-07-15"), { confirmedPeriodKeys: ["QUINCENA-2026-07-15"] }), null);
});

test("si el cierre del mes está confirmado, el día 31 sí avisa la quincena", () => {
  // El 31 de julio de 2026 caen las dos cosas. Confirmado el mes, queda la quincena.
  const soloQuincena = reminderFor(day("2026-07-31"), { confirmedPeriodKeys: ["MES-2026-08-01"] });
  assert.equal(soloQuincena?.kind, "QUINCENA");
});

test("un día cualquiera no molesta a nadie", () => {
  assert.equal(reminderFor(day("2026-07-14")), null);
  assert.equal(reminderFor(day("2026-07-08")), null);
  assert.equal(reminderFor(day("2026-07-20")), null);
});

import { retailMonthBoundsFor as boundsFor } from "../lib/report-deadlines";

/**
 * Primas dominicales: el mes natural y el retail NO traen los mismos domingos, y
 * la diferencia se paga.
 *
 * Agosto 2026 es el caso real que lo destapó: natural trae CINCO domingos
 * (2, 9, 16, 23 y 30) y retail solo CUATRO, porque el 30 ya pertenece a
 * septiembre retail. Reportar por natural pagaría una prima de más por persona.
 *
 * En julio los dos daban los mismos cuatro domingos: por eso el fallo estuvo
 * meses invisible.
 */
test("mes retail vs natural — domingos que se pagan", async (t) => {
  function domingos(start: Date, end: Date): string[] {
    const out: string[] = [];
    for (let t = start.getTime(); t <= end.getTime(); t += 86_400_000) {
      const day = new Date(t);
      if (day.getUTCDay() === 0) out.push(day.toISOString().slice(0, 10));
    }
    return out;
  }

  await t.test("agosto 2026: el retail deja fuera el domingo 30", () => {
    const bounds = boundsFor(new Date("2026-08-15T00:00:00Z"));
    assert.equal(bounds.start.toISOString().slice(0, 10), "2026-08-02");
    assert.equal(bounds.end.toISOString().slice(0, 10), "2026-08-29");

    const retail = domingos(bounds.start, bounds.end);
    const natural = domingos(new Date("2026-08-01T00:00:00Z"), new Date("2026-08-31T00:00:00Z"));

    assert.equal(retail.length, 4, "cuatro primas dominicales");
    assert.equal(natural.length, 5, "por natural saldrían cinco");
    assert.ok(!retail.includes("2026-08-30"), "el 30 es septiembre retail, no agosto");
  });

  await t.test("el 1 de agosto pertenece a JULIO retail, no a agosto", () => {
    // Si se contara en agosto se reportaría dos veces: ya fue en el cierre de julio.
    const bounds = boundsFor(new Date("2026-08-01T00:00:00Z"));
    assert.equal(bounds.start.toISOString().slice(0, 10), "2026-07-05");
    assert.equal(bounds.end.toISOString().slice(0, 10), "2026-08-01");
  });

  await t.test("julio 2026 coincidía: por eso el fallo pasó desapercibido", () => {
    const bounds = boundsFor(new Date("2026-07-15T00:00:00Z"));
    const retail = domingos(bounds.start, bounds.end);
    const natural = domingos(new Date("2026-07-01T00:00:00Z"), new Date("2026-07-31T00:00:00Z"));
    assert.deepEqual(retail, natural, "mismos domingos: la diferencia era invisible");
  });
});
