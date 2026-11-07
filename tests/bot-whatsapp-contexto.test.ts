import assert from "node:assert/strict";
import test from "node:test";

import {
  armarContexto,
  describirTurno,
  describirVenta,
  esPreguntaConFoto,
  turnosAlternados,
  type ContextoBot
} from "@/lib/bot-whatsapp-contexto";

/*
 * Por qué existen estas pruebas.
 *
 * El bot inventaba horarios: no tenía ninguno y el modelo rellenaba. Ahora le
 * llegan los datos de la persona, y lo que importa es que lleguen bien y que
 * no se cuele nada de nadie más. Los datos de aquí son inventados.
 */

const HOY = new Date(Date.UTC(2026, 10, 9)); // lunes 9 nov
const dia = (n: number) => new Date(HOY.getTime() + n * 86_400_000);

test("el turno dice hoy y mañana, y un descanso no lleva horas", () => {
  assert.equal(describirTurno({ fecha: HOY, status: "WORKING", inicio: "10:30", fin: "19:00" }, HOY), "hoy (lunes 9 nov): 10:30 a 19:00");
  assert.equal(describirTurno({ fecha: dia(1), status: "OFF", inicio: null, fin: null }, HOY), "mañana (martes 10 nov): descanso");
  assert.equal(describirTurno({ fecha: dia(2), status: "WORKING", inicio: null, fin: null }, HOY), "miércoles 11 nov: horario sin capturar");
});

test("la venta dice hasta qué día llega la captura", () => {
  const texto = describirVenta("Su venta", { venta: 45_000, meta: 90_000, ultimaCaptura: dia(-1) });
  assert.match(texto, /50 %/);
  assert.match(texto, /capturado hasta el domingo 8 nov/);
});

test("un mes sin captura no se lee como venta en cero", () => {
  assert.equal(describirVenta("Su venta", { venta: 0, meta: 90_000, ultimaCaptura: null }), "Su venta: todavía sin venta capturada este mes");
});

test("el contexto de un asesor no lleva la venta de tienda", () => {
  const base: ContextoBot = {
    nombre: "ALGUIEN DE PRUEBA",
    rol: "ASESOR",
    hoy: HOY,
    turnos: [],
    ventaPersonal: { venta: 1000, meta: 2000, ultimaCaptura: HOY },
    ventaTienda: null,
    pendientes: [{ titulo: "Etiquetar sobrante", vence: dia(1) }],
    comunicadosSinLeer: ["Nueva promoción"],
    cursos: ["Servicio"],
    tareaFija: "Limpiar la bodega"
  };
  const texto = armarContexto(base);
  assert.doesNotMatch(texto, /tienda del mes/);
  assert.match(texto, /no hay horario capturado/);
  assert.match(texto, /Limpiar la bodega · Etiquetar sobrante \(vence martes 10 nov\) · cursos sin aprobar: Servicio/);
  assert.match(texto, /Nueva promoción/);
});

test("una foto con pregunta se contesta; sin pie o con un comentario es evidencia", () => {
  assert.equal(esPreguntaConFoto("¿esto va en la bodega?"), true);
  assert.equal(esPreguntaConFoto("donde pongo esto"), true);
  assert.equal(esPreguntaConFoto(null), false);
  assert.equal(esPreguntaConFoto("listo la bodega"), false);
  assert.equal(esPreguntaConFoto("ya quedó"), false);
});

test("la conversación siempre empieza por el usuario y alterna", () => {
  assert.deepEqual(turnosAlternados([], "hola"), [{ role: "user", text: "hola" }]);
  // Historial descuadrado: dos del usuario seguidos se juntan.
  const t = turnosAlternados(["a", "b", "c"], "d");
  assert.deepEqual(t.map((x) => x.role), ["user", "assistant", "user"]);
  assert.equal(t[2].text, "c\nd");
  // Vacíos fuera.
  assert.deepEqual(turnosAlternados(["", "respuesta"], "hola").map((x) => x.role), ["user"]);
});
