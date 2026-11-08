import assert from "node:assert/strict";
import test from "node:test";
import { ROLES_CON_RECORDATORIO_DE_TURNO, shiftReminderText, shouldSendShiftReminder, timeToMinutes } from "../lib/shift-reminder";

test("convierte horarios válidos a minutos y rechaza entradas ambiguas", () => {
  assert.equal(timeToMinutes("10:30"), 630);
  assert.equal(timeToMinutes("00:00"), 0);
  assert.equal(timeToMinutes("9:30"), null);
  assert.equal(timeToMinutes("24:00"), null);
});

test("recuerda el turno dentro de una ventana tolerante de una hora", () => {
  assert.equal(shouldSendShiftReminder("10:30", 570), true);
  assert.equal(shouldSendShiftReminder("10:30", 555), true);
  assert.equal(shouldSendShiftReminder("10:30", 585), true);
  assert.equal(shouldSendShiftReminder("10:30", 586), false);
  assert.equal(shouldSendShiftReminder("10:30", 554), false);
});

test("el recordatorio incluye la zona cuando está disponible", () => {
  assert.deepEqual(shiftReminderText("10:30", "Piso de venta"), {
    title: "Tu turno empieza a las 10:30",
    body: "Prepárate para tu jornada. Hoy estarás en Piso de venta."
  });
  assert.match(shiftReminderText("10:30", null).body, /Mi día/);
});

test("el recordatorio de turno es solo para asesores, no para gerencia", () => {
  assert.deepEqual([...ROLES_CON_RECORDATORIO_DE_TURNO], ["ASESOR"]);
});

test("la consulta del cron filtra por esos puestos", async () => {
  const { readFile } = await import("node:fs/promises");
  const ruta = await readFile(new URL("../app/api/cron/shift-reminder/route.ts", import.meta.url), "utf8");
  assert.match(ruta, /role: \{ in: \[\.\.\.ROLES_CON_RECORDATORIO_DE_TURNO\] \}/);
});
