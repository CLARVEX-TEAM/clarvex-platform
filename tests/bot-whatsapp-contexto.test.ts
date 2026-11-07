import assert from "node:assert/strict";
import test from "node:test";

import {
  armarContexto,
  armarDias,
  describirComision,
  describirDia,
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
    ventaPorDia: [{ fecha: dia(-1), venta: 9800, meta: 9155, estado: "vendio" }],
    comision: null,
    equipo: [],
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
  assert.match(texto, /domingo 8 nov: \$9,800 de \$9,155 \(107 %\)/);
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

test("un día sin venta de la persona está capturado si la tienda lo capturó", () => {
  const inicio = dia(-3); // jueves 5
  const k = (n: number) => dia(n).toISOString().slice(0, 10);
  const dias = armarDias({
    inicio,
    hasta: dia(-1),
    capturados: new Set([k(-3), k(-2), k(-1)]),
    filas: new Map([[k(-3), { venta: 5670, meta: 6000 }], [k(-2), { venta: 0, meta: 6000 }]]),
    horarios: new Map([[k(-1), "OFF"]])
  });
  assert.deepEqual(dias.map((d) => d.estado), ["vendio", "sin-venta", "descanso"]);
  assert.match(describirDia(dias[1]), /no vendió/);
  assert.doesNotMatch(dias.map(describirDia).join(" "), /aún no captura/);
});

test("solo es «sin captura» el día que la tienda no capturó", () => {
  const k = (n: number) => dia(n).toISOString().slice(0, 10);
  const dias = armarDias({ inicio: dia(-2), hasta: dia(-1), capturados: new Set([k(-1)]), filas: new Map(), horarios: new Map() });
  assert.equal(dias[0].estado, "sin-captura");
  assert.equal(armarDias({ inicio: dia(-2), hasta: null, capturados: new Set(), filas: new Map(), horarios: new Map() }).length, 0);
});

test("la comisión va con centavos y dice cuánto falta para el siguiente nivel", () => {
  const texto = describirComision({
    nombre: "Su comisión", venta: 45000, minimo: 40000, alcance: 112.5, porcentaje: 1.91, monto: 859.5, tieneMinimo: true,
    siguiente: { faltan: 1000, porcentaje: 2.29 }
  });
  assert.match(texto, /comisión \$859\.50 \(1\.91 %\)/);
  assert.match(texto, /113 % de alcance/);
  assert.match(texto, /le faltan \$1,000 de venta para subir a 2\.29 %/);
  assert.match(describirComision({ nombre: "X", venta: 0, minimo: 0, alcance: 0, porcentaje: 0, monto: 0, tieneMinimo: false, siguiente: null }), /sin mínimo/);
});
