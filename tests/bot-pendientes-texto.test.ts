import { test } from "node:test";
import assert from "node:assert/strict";
import { diceQueTermino, leerDecision, leerEleccion, recordatorioSegunEstado } from "../lib/bot-pendientes-texto";

test("«terminé» en sus formas, y no cuando dice que NO terminó", () => {
  for (const t of ["ya terminé", "Termine el curso", "ya lo acabé", "Ya completé la capacitación", "listo, ya acabe"]) {
    assert.equal(diceQueTermino(t), true, t);
  }
  for (const t of ["no terminé", "todavía no acabé el curso", "no he terminado", "todavía no acabo", "aún no lo termino", "cuánto llevo de venta?", "", null]) {
    assert.equal(diceQueTermino(t), false, String(t));
  }
});

test("elegir de la lista: solo un número dentro del rango", () => {
  assert.equal(leerEleccion("2", 3), 2);
  assert.equal(leerEleccion("el 1", 3), 1);
  assert.equal(leerEleccion("4", 3), null);
  assert.equal(leerEleccion("tengo 2 dudas", 3), null);
});

test("la decisión de gerencia", () => {
  assert.deepEqual(leerDecision("Sí"), { cerrar: true, numero: null });
  assert.deepEqual(leerDecision("si 2"), { cerrar: true, numero: 2 });
  assert.deepEqual(leerDecision("cerrar"), { cerrar: true, numero: null });
  assert.deepEqual(leerDecision("no 1"), { cerrar: false, numero: 1 });
  // Plática normal no es una decisión: se la lleva la IA.
  assert.equal(leerDecision("si cuánto vendió Alonso hoy?"), null);
  assert.equal(leerDecision("nomás quería saber"), null);
});

test("el recordatorio cambia con el estatus, y calla si ya pidió cierre", () => {
  const base = { nombre: "ALONSO TREVIÑO", titulo: "Capacitación Expertos One Axo" };
  assert.match(recordatorioSegunEstado({ ...base, estado: "PENDIENTE", cierrePedido: false }) ?? "", /todavía no registras avance/);
  assert.match(recordatorioSegunEstado({ ...base, estado: "EN_PROCESO", cierrePedido: false }) ?? "", /cómo vas.*\n.*terminé/s);
  assert.equal(recordatorioSegunEstado({ ...base, estado: "EN_PROCESO", cierrePedido: true }), null);
  assert.equal(recordatorioSegunEstado({ ...base, estado: "COMPLETADO", cierrePedido: false }), null);
});
