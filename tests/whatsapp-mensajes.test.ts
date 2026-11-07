import assert from "node:assert/strict";
import test from "node:test";

import { formatoGenerico, pesos, semaforo, tabla } from "@/lib/whatsapp-formato";
import {
  analizarSemana,
  cierreDeSemana,
  lineasDeAnalisis,
  metasDeLaSemana,
  rangoSemana,
  totalMetas,
  type DiaVenta
} from "@/lib/whatsapp-mensajes";

/*
 * Por qué existen estas pruebas.
 *
 * Estos mensajes los recibe el equipo en su WhatsApp y se quedan en el
 * historial: un total que no cuadra con su tabla, o un día de descanso contado
 * como día bajo, se lee como un error de la tienda. Los datos son inventados.
 */

const d = (n: number) => new Date(Date.UTC(2026, 10, 8 + n)); // domingo 8 nov + n

test("pesos sin centavos y con signo en una devolución", () => {
  assert.equal(pesos(9154.76), "$9,155");
  assert.equal(pesos(-1200.4), "-$1,200");
});

test("el semáforo usa los mismos cortes que la app", () => {
  assert.equal(semaforo(100), "🟢");
  assert.equal(semaforo(85), "🟡");
  assert.equal(semaforo(84), "🔴");
  assert.equal(semaforo(null), "⚪");
});

test("la tabla alinea las cifras a la derecha y va en bloque de ancho fijo", () => {
  const t = tabla([["Dom 8", "$9,155"], ["Total", "$51,175"]]);
  assert.equal(t, "```\nDom 8   $9,155\nTotal  $51,175\n```");
});

test("el aviso genérico lleva título en negrita y el enlace a la pantalla", () => {
  const texto = formatoGenerico({ title: "⏰ Turno", body: "Entras en una hora.", url: "/mi-dia" });
  assert.match(texto, /^\*⏰ Turno\*\n\nEntras en una hora\.\n\n👉 https?:\/\/.+\/mi-dia$/);
});

test("el rango de la semana cambia de forma si cruza de mes", () => {
  assert.equal(rangoSemana(d(0), d(6)), "8 al 14 de noviembre");
  assert.equal(rangoSemana(new Date(Date.UTC(2026, 9, 25)), new Date(Date.UTC(2026, 9, 31))), "25 al 31 de octubre");
  assert.equal(rangoSemana(new Date(Date.UTC(2026, 10, 29)), new Date(Date.UTC(2026, 11, 5))), "29 de nov al 5 de dic");
});

test("las metas no suman el día de descanso, y el total cuadra con la tabla", () => {
  const dias = [
    { fecha: d(0), meta: 9000, descansa: false },
    { fecha: d(1), meta: 5000, descansa: true },
    { fecha: d(2), meta: 6000, descansa: false }
  ];
  assert.equal(totalMetas(dias), 15000);
  const texto = metasDeLaSemana({ nombre: "ALGUIEN DE PRUEBA", semana: 46, inicio: d(0), fin: d(6), dias, actualizacion: false });
  assert.match(texto, /Tus metas de la semana 46/);
  assert.match(texto, /Lun 9\s+descanso/);
  assert.match(texto, /Total\s+\$15,000/);
  assert.match(texto, /Hola Alguien 👋/);
  // Con tarjeta, el pie no repite la tabla.
  const pie = metasDeLaSemana({ nombre: "ALGUIEN", semana: 46, inicio: d(0), fin: d(6), dias, actualizacion: true, conTarjeta: true });
  assert.doesNotMatch(pie, /```/);
  assert.match(pie, /Se actualizaron tus metas/);
});

const semana: DiaVenta[] = [
  { fecha: d(0), meta: 10000, venta: 12000, descansa: false, capturado: true }, // 120 %
  { fecha: d(1), meta: 8000, venta: 4000, descansa: false, capturado: true }, // 50 %
  { fecha: d(2), meta: 0, venta: 0, descansa: true, capturado: true },
  { fecha: d(3), meta: 8000, venta: 8000, descansa: false, capturado: true } // 100 %
];

test("el análisis cuenta días trabajados, no los de descanso", () => {
  const a = analizarSemana(semana, 20000);
  assert.equal(a.venta, 24000);
  assert.equal(a.meta, 26000);
  assert.equal(a.diasTrabajados, 3);
  assert.equal(a.diasEnMeta, 2);
  assert.equal(a.mejor?.fecha.getUTCDay(), 0);
  assert.equal(a.peor?.fecha.getUTCDay(), 1);
  assert.equal(a.vsAnterior, 20);
});

test("un día sin captura no cuenta como venta en cero", () => {
  const a = analizarSemana([...semana, { fecha: d(4), meta: 8000, venta: 0, descansa: false, capturado: false }], null);
  assert.equal(a.diasTrabajados, 3);
  assert.equal(a.vsAnterior, null);
  const texto = cierreDeSemana({ nombre: "ALGUIEN", semana: 45, inicio: d(0), fin: d(6), dias: [...semana, { fecha: d(4), meta: 8000, venta: 0, descansa: false, capturado: false }], ventaAnterior: null });
  assert.match(texto, /Jue 12\s+sin captura/);
  assert.match(texto, /Hay días sin captura/);
});

test("el análisis dice el día más bajo solo si quedó debajo de la meta", () => {
  const lineas = lineasDeAnalisis(analizarSemana(semana, 20000));
  assert.ok(lineas.some((l) => l.includes("2 de 3")));
  assert.ok(lineas.some((l) => l.includes("domingo")));
  assert.ok(lineas.some((l) => l.includes("20 % más")));
  assert.ok(lineas.some((l) => l.includes("lunes") && l.includes("50 %")));
  const todoEnMeta = lineasDeAnalisis(analizarSemana([semana[0], semana[3]], null));
  assert.ok(!todoEnMeta.some((l) => l.includes("día más bajo")));
});

test("los horarios dicen el turno de cada día y cuántos días trabaja", async () => {
  const { horariosDeLaSemana, textoTurno } = await import("@/lib/whatsapp-mensajes");
  assert.equal(textoTurno({ fecha: d(0), status: "WORKING", inicio: "10:30", fin: "19:00" }), "10:30 – 19:00");
  assert.equal(textoTurno({ fecha: d(0), status: "INVENTORY", inicio: "08:00", fin: "16:00" }), "Inventario · 08:00 – 16:00");
  assert.equal(textoTurno({ fecha: d(0), status: "OFF", inicio: null, fin: null }), "Descanso");
  assert.equal(textoTurno({ fecha: d(0), status: "WORKING", inicio: null, fin: null }), "Hora por confirmar");
  assert.equal(textoTurno({ fecha: d(0), status: "SIN_CAPTURA", inicio: null, fin: null }), "Por definir");
  const dias = [
    { fecha: d(0), status: "WORKING", inicio: "10:30", fin: "19:00" },
    { fecha: d(1), status: "OFF", inicio: null, fin: null }
  ];
  const pie = horariosDeLaSemana({ nombre: "ALGUIEN", inicio: d(0), fin: d(6), dias, actualizacion: false, conTarjeta: true });
  assert.match(pie, /Ya están tus horarios/);
  assert.match(pie, /Trabajas \*1 día\*/);
  const completo = horariosDeLaSemana({ nombre: "ALGUIEN", inicio: d(0), fin: d(6), dias, actualizacion: true });
  assert.match(completo, /Se actualizó tu horario/);
  assert.match(completo, /Lun 9\s+Descanso/);
  assert.match(completo, /\/horarios$/);
});
