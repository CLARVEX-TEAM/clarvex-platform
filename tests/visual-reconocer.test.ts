import assert from "node:assert/strict";
import test from "node:test";
import {
  cambiarZona,
  construirPrompt,
  esSinNombre,
  interpretarReparto,
  type Asignacion,
  type FotoAnonima
} from "../lib/visual-reconocer";

const ZONAS = ["Fachada", "Ventana  Caballero", "WSW ZONA 1", "MSW ZONA 1", "Licencias  2"];

const foto = (n: number): FotoAnonima => ({ archivo: `sin-nombre-${n}.jpg`, contenido: Buffer.alloc(0) });
const FOTOS = [foto(1), foto(2), foto(3), foto(4), foto(5)];

const respuesta = (reparto: unknown) => JSON.stringify({ reparto });

const BIEN = respuesta([
  { foto: 1, zona: "Fachada", seguridad: "alta", porque: "el logo de la calle" },
  { foto: 2, zona: "Ventana Caballero", seguridad: "alta", porque: "piso a rayas" },
  { foto: 3, zona: "WSW ZONA 1", seguridad: "alta", porque: "letrero GARMIN" },
  { foto: 4, zona: "MSW ZONA 1", seguridad: "media", porque: "cinco paneles" },
  { foto: 5, zona: "licencias 2", seguridad: "alta", porque: "vitrina de gafas" }
]);

test("un reparto completo se acepta", () => {
  const r = interpretarReparto(BIEN, FOTOS, ZONAS);
  assert.ok(r.ok, r.ok ? "" : r.error);
  assert.equal(r.asignaciones.length, 5);
});

test("devuelve el nombre EXACTO de la plantilla, no el que escribio el modelo", () => {
  const r = interpretarReparto(BIEN, FOTOS, ZONAS);
  assert.ok(r.ok);
  // ⚠️ El modelo contesto «Ventana Caballero» y «licencias 2»; la plantilla las
  // llama con espacio doble y mayuscula. La foto se bautiza como la plantilla,
  // que es lo unico que el armador reconoce.
  assert.equal(r.asignaciones[1].etiqueta, "Ventana  Caballero");
  assert.equal(r.asignaciones[4].etiqueta, "Licencias  2");
});

test("sale en el orden de las fotos, no en el que contesto", () => {
  const alreves = respuesta([
    { foto: 5, zona: "Licencias  2" },
    { foto: 3, zona: "WSW ZONA 1" },
    { foto: 1, zona: "Fachada" },
    { foto: 4, zona: "MSW ZONA 1" },
    { foto: 2, zona: "Ventana  Caballero" }
  ]);
  const r = interpretarReparto(alreves, FOTOS, ZONAS);
  assert.ok(r.ok);
  assert.deepEqual(r.asignaciones.map((a) => a.archivo), FOTOS.map((f) => f.archivo));
});

/* ─── lo que NO se da por bueno ───────────────────────────────────────────── */

test("dos fotos en la misma zona se rechazan", () => {
  const r = interpretarReparto(
    respuesta([
      { foto: 1, zona: "Fachada" },
      { foto: 2, zona: "Fachada" }
    ]),
    FOTOS,
    ZONAS
  );
  assert.equal(r.ok, false);
  assert.ok(!r.ok && r.error.includes("Fachada"), !r.ok ? r.error : "");
});

test("una zona inventada se rechaza, con su nombre", () => {
  const r = interpretarReparto(respuesta([{ foto: 1, zona: "PROBADORES" }]), FOTOS, ZONAS);
  assert.equal(r.ok, false);
  assert.ok(!r.ok && r.error.includes("PROBADORES"));
});

test("un reparto a medias se rechaza y dice cuales faltan", () => {
  // ⚠️ Es el fallo caro: colocaria tres bien y dejaria dos laminas vacias sin
  // que nada avise de cuales.
  const r = interpretarReparto(
    respuesta([
      { foto: 1, zona: "Fachada" },
      { foto: 2, zona: "Ventana  Caballero" },
      { foto: 3, zona: "WSW ZONA 1" }
    ]),
    FOTOS,
    ZONAS
  );
  assert.equal(r.ok, false);
  assert.ok(!r.ok && r.error.includes("sin-nombre-4.jpg") && r.error.includes("sin-nombre-5.jpg"), !r.ok ? r.error : "");
});

test("una foto que no existe se rechaza", () => {
  const r = interpretarReparto(respuesta([{ foto: 9, zona: "Fachada" }]), FOTOS, ZONAS);
  assert.equal(r.ok, false);
  assert.ok(!r.ok && r.error.includes("9"));
});

test("la misma foto dos veces se rechaza", () => {
  const r = interpretarReparto(
    respuesta([
      { foto: 1, zona: "Fachada" },
      { foto: 1, zona: "WSW ZONA 1" }
    ]),
    FOTOS,
    ZONAS
  );
  assert.equal(r.ok, false);
});

test("una respuesta que no es JSON se rechaza sin reventar", () => {
  assert.equal(interpretarReparto("lo siento, no puedo", FOTOS, ZONAS).ok, false);
});

test("acepta el JSON envuelto en bloque de codigo", () => {
  const r = interpretarReparto("```json\n" + BIEN + "\n```", FOTOS, ZONAS);
  assert.ok(r.ok, r.ok ? "" : r.error);
});

/* ─── corregir a mano ─────────────────────────────────────────────────────── */

const propuesta = (): Asignacion[] => {
  const r = interpretarReparto(BIEN, FOTOS, ZONAS);
  assert.ok(r.ok);
  return r.asignaciones;
};

test("corregir una foto INTERCAMBIA con quien tenia esa zona", () => {
  // ⚠️ Si solo se reasignara, quedarian dos fotos en MSW ZONA 1 y ninguna en
  // WSW ZONA 1: se rompe justo lo que hace que el reparto funcione.
  const r = cambiarZona(propuesta(), "sin-nombre-3.jpg", "MSW ZONA 1", ZONAS);
  assert.ok(r.ok, r.ok ? "" : r.error);

  const porArchivo = new Map(r.asignaciones.map((a) => [a.archivo, a.etiqueta]));
  assert.equal(porArchivo.get("sin-nombre-3.jpg"), "MSW ZONA 1");
  assert.equal(porArchivo.get("sin-nombre-4.jpg"), "WSW ZONA 1");
  // Y sigue habiendo cinco zonas distintas.
  assert.equal(new Set(r.asignaciones.map((a) => a.etiqueta)).size, 5);
});

test("corregir con el nombre mal escrito sigue funcionando", () => {
  const r = cambiarZona(propuesta(), "sin-nombre-5.jpg", "licencias 2", ZONAS);
  assert.ok(r.ok);
  assert.equal(r.asignaciones.find((a) => a.archivo === "sin-nombre-5.jpg")?.etiqueta, "Licencias  2");
});

test("corregir a una zona que no existe se rechaza", () => {
  const r = cambiarZona(propuesta(), "sin-nombre-1.jpg", "PROBADORES", ZONAS);
  assert.equal(r.ok, false);
});

test("corregir una foto que no esta en la propuesta se rechaza", () => {
  const r = cambiarZona(propuesta(), "otra.jpg", "Fachada", ZONAS);
  assert.equal(r.ok, false);
});

/* ─── lo pequeño ──────────────────────────────────────────────────────────── */

test("reconoce cuales llegaron sin pie", () => {
  assert.equal(esSinNombre("sin-nombre-4821.jpg"), true);
  assert.equal(esSinNombre("WSW ZONA 2.jpg"), false);
});

test("el prompt dice cuantas hay de cada y avisa del espejo dama/caballero", () => {
  const p = construirPrompt(
    ZONAS.map((z) => ({ etiqueta: z, contenido: Buffer.alloc(0) })),
    FOTOS
  );
  assert.ok(p.includes("Las primeras 5"));
  assert.ok(p.includes("Despues vienen 5"));
  // El aviso que subio el acierto de 10 a 13: sin el, confundia los dos lados.
  assert.ok(p.includes("espejo"));
});
