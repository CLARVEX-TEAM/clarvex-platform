import assert from "node:assert/strict";
import test from "node:test";
import { canApprove, canRespond, driveInstructions, isReflectedInSchedule, validateProposal } from "../lib/shift-swap";

const HOY = "2026-07-14";

// El caso real: Alonso descansa el miércoles, Jazmín el lunes. Se los cambian.
const ALONSO = "alonso";
const JAZMIN = "jazmin";
const MIERCOLES = "2026-07-22";
const LUNES = "2026-07-20";

/** Horario de partida: cada quien descansa SU día. */
const scheduleAntes = (userId: string, date: string) => {
  if (userId === ALONSO && date === MIERCOLES) return "OFF";
  if (userId === JAZMIN && date === LUNES) return "OFF";
  return "WORKING";
};

const propuesta = {
  requesterId: ALONSO,
  requesterDate: MIERCOLES,
  targetId: JAZMIN,
  targetDate: LUNES
};

test("una propuesta válida pasa", () => {
  assert.equal(validateProposal(propuesta, scheduleAntes, HOY), null);
});

test("no puedes ofrecer un día que NO es tu descanso", () => {
  // Alonso dice que cede el jueves, pero ese día le toca trabajar.
  const error = validateProposal(
    { ...propuesta, requesterDate: "2026-07-23" },
    scheduleAntes,
    HOY
  );
  assert.match(error!, /no es tu descanso/);
});

test("no puedes pedir un día que NO es el descanso del compañero", () => {
  const error = validateProposal({ ...propuesta, targetDate: "2026-07-21" }, scheduleAntes, HOY);
  assert.match(error!, /no es el descanso de tu compañero/);
});

test("no se puede intercambiar un día que ya pasó", () => {
  const error = validateProposal(
    { ...propuesta, requesterDate: "2026-07-01" },
    scheduleAntes,
    HOY
  );
  assert.match(error!, /días futuros/);
});

test("no puedes intercambiar contigo mismo", () => {
  const error = validateProposal({ ...propuesta, targetId: ALONSO }, scheduleAntes, HOY);
  assert.match(error!, /contigo mismo/);
});

test("solo el compañero responde, y solo mientras esté pendiente", () => {
  const swap = { targetId: JAZMIN, status: "PENDIENTE_COMPANERO" };
  assert.equal(canRespond(swap, JAZMIN), true);
  assert.equal(canRespond(swap, ALONSO), false); // el proponente no se acepta solo
  // Ya respondido: no se puede volver a responder.
  assert.equal(canRespond({ targetId: JAZMIN, status: "PENDIENTE_GERENCIA" }, JAZMIN), false);
});

test("gerencia solo autoriza lo que el compañero ya aceptó", () => {
  assert.equal(canApprove({ status: "PENDIENTE_GERENCIA" }), true);
  // Sin el sí del compañero, gerencia no puede aprobar por encima de él.
  assert.equal(canApprove({ status: "PENDIENTE_COMPANERO" }), false);
  assert.equal(canApprove({ status: "APROBADO" }), false);
});

test("las instrucciones del Drive salen masticadas", () => {
  const lines = driveInstructions({
    requesterName: "Alonso",
    requesterDate: MIERCOLES,
    targetName: "Jazmín",
    targetDate: LUNES
  });
  assert.equal(lines.length, 2);
  assert.match(lines[0], /Alonso.*2026-07-22 pasa a LABORANDO.*2026-07-20 a DESCANSO/);
  assert.match(lines[1], /Jazmín.*2026-07-20 pasa a LABORANDO.*2026-07-22 a DESCANSO/);
});

test("detecta cuando el Drive ya refleja el cambio", () => {
  // Horario DESPUÉS de que gerencia actualizó: los descansos están cruzados.
  const scheduleDespues = (userId: string, date: string) => {
    if (userId === ALONSO && date === LUNES) return "OFF";
    if (userId === JAZMIN && date === MIERCOLES) return "OFF";
    return "WORKING";
  };
  assert.equal(isReflectedInSchedule(propuesta, scheduleDespues), true);
  // Con el horario viejo, todavía no: el recordatorio a gerencia sigue vivo.
  assert.equal(isReflectedInSchedule(propuesta, scheduleAntes), false);
});

test("un cambio a medias NO cuenta como reflejado", () => {
  // Gerencia cambió a Alonso pero se le olvidó Jazmín. Es justo el error que
  // causó el bug del ranking: los dos laborando el mismo día.
  const aMedias = (userId: string, date: string) => {
    if (userId === ALONSO && date === LUNES) return "OFF";
    if (userId === JAZMIN && date === LUNES) return "OFF"; // no se actualizó
    return "WORKING";
  };
  assert.equal(isReflectedInSchedule(propuesta, aMedias), false);
});
