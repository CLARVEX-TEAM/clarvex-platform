import assert from "node:assert/strict";
import test from "node:test";

import { domingoDeSemana, fechasDeSemana, montoValido, resumirSemana, vistaPara } from "@/lib/campana";
import { describirCampana } from "@/lib/bot-whatsapp-contexto";
import { lineaCampanaPersona, lineaCampanaTienda } from "@/lib/whatsapp-mensajes";

/*
 * Por qué existen estas pruebas.
 *
 * Tailored Help se captura a mano y la meta llega por tienda y por día. Lo que
 * no puede pasar: que un asesor vea lo que juntó otra persona, que un día sin
 * capturar se cuente como «no juntamos nada», o que un monto mal tecleado
 * entre como dinero. Los datos son inventados; las metas, las de la semana 45.
 */

const DOMINGO = new Date(Date.UTC(2026, 10, 8));
const metas = ["2026-11-08", "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14"].map((fecha, i) => ({
  fecha,
  meta: [43, 22, 22, 43, 43, 54, 65][i]
}));
const personas = [
  { userId: "a", nombre: "PERSONA A" },
  { userId: "b", nombre: "PERSONA B" }
];

test("la semana retail va de domingo a sábado", () => {
  assert.equal(domingoDeSemana(new Date(Date.UTC(2026, 10, 12))).toISOString().slice(0, 10), "2026-11-08");
  assert.equal(domingoDeSemana(DOMINGO).toISOString().slice(0, 10), "2026-11-08");
  assert.deepEqual(fechasDeSemana(DOMINGO).at(-1), "2026-11-14");
});

test("el resumen suma la meta de la semana y lo de cada quien", () => {
  const r = resumirSemana({
    inicio: DOMINGO,
    metas,
    personas,
    aportes: [
      { userId: "a", fecha: "2026-11-08", monto: 30, donativos: 3 },
      { userId: "b", fecha: "2026-11-08", monto: 20, donativos: 1 },
      { userId: "a", fecha: "2026-11-09", monto: 0, donativos: 0 },
      { userId: "a", fecha: "2026-11-15", monto: 999, donativos: 9 } // otra semana: no cuenta
    ]
  });
  assert.equal(r.meta, 292);
  assert.equal(r.total, 50);
  assert.equal(r.alcance, 17);
  assert.equal(r.personas[0].userId, "a");
  assert.equal(r.personas[0].donativos, 3);
  assert.deepEqual(r.dias.map((d) => d.capturado), [true, true, false, false, false, false, false]);
});

test("el ranking es de todos: gerencia y asesores, ordenado por monto", () => {
  const r = resumirSemana({ inicio: DOMINGO, metas, personas, aportes: [{ userId: "b", fecha: "2026-11-08", monto: 20, donativos: 1 }] });
  assert.deepEqual(vistaPara(r).personas.map((p) => p.userId), ["b", "a"]);
  assert.equal(vistaPara(r).personas[1].total, 0); // quien no ha juntado también aparece
});

test("sin meta cargada el alcance es null, no 0 %", () => {
  assert.equal(resumirSemana({ inicio: DOMINGO, metas: [], personas, aportes: [] }).alcance, null);
});

test("los montos se validan antes de entrar como dinero", () => {
  assert.equal(montoValido("$1,234.567"), 1234.57);
  assert.equal(montoValido(43), 43);
  assert.equal(montoValido("-5"), null);
  assert.equal(montoValido("abc"), null);
  assert.equal(montoValido(250000), null);
});

test("el bot le dice a cada quien su aporte y la meta de la TIENDA", () => {
  const asesor = describirCampana({ semanaTienda: 50, semanaMeta: 292, propioSemana: 30, propioTotal: 80, tiendaTotal: 200, equipo: null });
  assert.match(asesor, /la meta es de la TIENDA/);
  assert.match(asesor, /esta persona aportó \$30/);
  assert.doesNotMatch(asesor, /por persona/);
  const gerencia = describirCampana({ semanaTienda: 50, semanaMeta: 292, propioSemana: 0, propioTotal: 0, tiendaTotal: 200, equipo: [{ nombre: "A", total: 30 }] });
  assert.match(gerencia, /solo gerencia/);
});

test("las líneas del cierre semanal", () => {
  assert.match(lineaCampanaPersona(30, 150, 292), /aportaste \*\$30\*.*\$150 de \$292 \(51 %\)/);
  const tienda = lineaCampanaTienda(150, 292, [{ nombre: "PERSONA A", total: 100 }]);
  assert.match(tienda, /Tailored Help:\* \$150 de \$292/);
  assert.match(tienda, /Persona\s+\$100/);
});

test("los avisos que esperan solo salen de 8 am a 9 pm de Monterrey", async () => {
  const { enHorarioDeAvisos } = await import("@/lib/horario-avisos");
  // Monterrey es UTC-6.
  assert.equal(enHorarioDeAvisos(new Date("2026-11-08T06:15:00Z")), false); // 12:15 am
  assert.equal(enHorarioDeAvisos(new Date("2026-11-08T13:59:00Z")), false); // 7:59 am
  assert.equal(enHorarioDeAvisos(new Date("2026-11-08T14:00:00Z")), true); // 8:00 am
  assert.equal(enHorarioDeAvisos(new Date("2026-11-09T02:59:00Z")), true); // 8:59 pm
  assert.equal(enHorarioDeAvisos(new Date("2026-11-09T03:00:00Z")), false); // 9:00 pm
});
