import assert from "node:assert/strict";
import test from "node:test";
import { monterreyMinutesOfDay } from "../lib/cron-time";

/**
 * El VPS corre en UTC y Monterrey es UTC−6. Este desfase ya causó un bug real:
 * la salvaguarda que evita faltas falsas comparaba el reloj UTC contra un horario
 * local ("10:30"), así que la corrida de la madrugada creía que la hora de corte
 * ya había pasado y le ponía FALTA a todo el equipo antes de abrir la tienda.
 */

test("convierte la hora UTC a la hora local de Monterrey", () => {
  // 18:00 UTC = 12:00 en Monterrey (la corrida de mediodía).
  assert.equal(monterreyMinutesOfDay(new Date("2026-07-14T18:00:00.000Z")), 12 * 60);
  // 16:30 UTC = 10:30 en Monterrey (la hora de entrada estándar).
  assert.equal(monterreyMinutesOfDay(new Date("2026-07-14T16:30:00.000Z")), 10 * 60 + 30);
});

test("el bug original: a las 12:00 UTC en Monterrey son las 6 de la mañana", () => {
  const minutes = monterreyMinutesOfDay(new Date("2026-07-14T12:00:00.000Z"));
  assert.equal(minutes, 6 * 60); // 06:00, NO 12:00

  // La hora de corte de quien entra a las 10:30 es 11:00 (660 min). A las 6 de la
  // mañana todavía NO ha pasado: nadie puede llevar falta.
  const cutoff = 10 * 60 + 30 + 30;
  assert.ok(minutes < cutoff, "a las 6 am no puede haber faltas: la tienda ni ha abierto");
});

test("medianoche no se convierte en 24:00", () => {
  // 06:00 UTC = 00:00 en Monterrey. Con hourCycle mal puesto daría 1440.
  assert.equal(monterreyMinutesOfDay(new Date("2026-07-14T06:00:00.000Z")), 0);
});
