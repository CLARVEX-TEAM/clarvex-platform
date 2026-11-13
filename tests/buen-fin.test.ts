import assert from "node:assert/strict";
import test from "node:test";
import { BUEN_FIN_FIN, BUEN_FIN_INICIO, buenFinActivo, siguienteCambioBuenFin } from "../lib/buen-fin";

test("los límites son medianoche en Ciudad de México", () => {
  const local = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Mexico_City",
    dateStyle: "short",
    timeStyle: "medium",
    hourCycle: "h23"
  });

  assert.equal(local.format(BUEN_FIN_INICIO), "2026-11-13 00:00:00");
  assert.equal(local.format(BUEN_FIN_FIN), "2026-11-18 00:00:00");
});

test("se activa al comenzar el 13 y desaparece al comenzar el 18", () => {
  assert.equal(buenFinActivo(Date.parse("2026-11-13T05:59:59.999Z")), false);
  assert.equal(buenFinActivo(Date.parse("2026-11-13T06:00:00.000Z")), true);
  assert.equal(buenFinActivo(Date.parse("2026-11-18T05:59:59.999Z")), true);
  assert.equal(buenFinActivo(Date.parse("2026-11-18T06:00:00.000Z")), false);
});

test("programa la apertura o el cierre y después deja de programar", () => {
  assert.equal(siguienteCambioBuenFin(BUEN_FIN_INICIO - 1), BUEN_FIN_INICIO);
  assert.equal(siguienteCambioBuenFin(BUEN_FIN_INICIO), BUEN_FIN_FIN);
  assert.equal(siguienteCambioBuenFin(BUEN_FIN_FIN), null);
});
