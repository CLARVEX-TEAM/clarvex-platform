import assert from "node:assert/strict";
import test from "node:test";
import { alternarMarca, alternarPrefijo, bloques, trozos } from "../lib/chat-formato";

test("las marcas son las de Slack, no las de Markdown", () => {
  /*
   * Deliberado: el chat se refleja en Slack tal cual, sin traducir. Con
   * Markdown (`**negrita**`) el mensaje llegaria alli con los asteriscos a la
   * vista.
   */
  assert.deepEqual(trozos("*hola*"), [{ tipo: "negrita", texto: "hola" }]);
  assert.deepEqual(trozos("_hola_"), [{ tipo: "cursiva", texto: "hola" }]);
  assert.deepEqual(trozos("~hola~"), [{ tipo: "tachado", texto: "hola" }]);
  assert.deepEqual(trozos("`hola`"), [{ tipo: "codigo", texto: "hola" }]);
});

test("un signo suelto se queda como texto", () => {
  /*
   * «2*3» no debe abrir una negrita que nunca cierra. Interpretarlo se comeria
   * el asterisco que la persona quiso escribir.
   */
  assert.deepEqual(trozos("2*3"), [{ tipo: "texto", texto: "2*3" }]);
  assert.deepEqual(trozos("hola * mundo"), [{ tipo: "texto", texto: "hola * mundo" }]);
});

test("una marca vacia no se interpreta", () => {
  assert.deepEqual(trozos("**"), [{ tipo: "texto", texto: "**" }]);
});

test("el codigo gana: dentro no se interpreta nada", () => {
  const t = trozos("`no *esto* cuenta`");
  assert.deepEqual(t, [{ tipo: "codigo", texto: "no *esto* cuenta" }]);
});

test("mezcla texto y marcas en orden", () => {
  assert.deepEqual(trozos("hola *mundo* adios"), [
    { tipo: "texto", texto: "hola " },
    { tipo: "negrita", texto: "mundo" },
    { tipo: "texto", texto: " adios" }
  ]);
});

test("cita, vineta y numerada son de LINEA entera", () => {
  // Un «-» a mitad de frase no puede abrir una lista.
  assert.equal(bloques("> citado")[0]?.tipo, "cita");
  assert.equal(bloques("- uno")[0]?.tipo, "vineta");
  assert.equal(bloques("1. uno")[0]?.tipo, "numero");
  assert.equal(bloques("dos - tres")[0]?.tipo, "parrafo");
});

test("la lista numerada se renumera desde 1", () => {
  /*
   * Alguien que pega una lista que empieza en 3, o que escribe «1.» tres
   * veces, espera verla ordenada y no repetida.
   */
  const b = bloques("1. uno\n1. dos\n1. tres");
  assert.deepEqual(
    b.map((x) => (x.tipo === "numero" ? x.indice : null)),
    [1, 2, 3]
  );
});

test("un salto de linea rompe la numeracion", () => {
  const b = bloques("1. uno\n\n1. otra lista");
  const indices = b.filter((x) => x.tipo === "numero").map((x) => (x.tipo === "numero" ? x.indice : 0));
  assert.deepEqual(indices, [1, 1]);
});

test("el bloque de codigo conserva lo de dentro tal cual", () => {
  const b = bloques("```\nSELECT *\nFROM \"Kpi\"\n```");
  assert.equal(b.length, 1);
  assert.equal(b[0]?.tipo, "codigo");
  assert.equal(b[0]?.tipo === "codigo" && b[0].texto, 'SELECT *\nFROM "Kpi"');
});

test("un bloque de codigo sin cerrar no se pierde", () => {
  // Se cierra solo al final: perder lo escrito es peor que pintarlo raro.
  const b = bloques("```\nalgo a medias");
  assert.equal(b[0]?.tipo, "codigo");
  assert.equal(b[0]?.tipo === "codigo" && b[0].texto, "algo a medias");
});

test("marcar una seleccion la envuelve y mueve el cursor", () => {
  const r = alternarMarca("hola mundo", 5, 10, "*");
  assert.equal(r.texto, "hola *mundo*");
  // El cursor sigue rodeando la palabra, no salta al final.
  assert.equal(r.texto.slice(r.desde, r.hasta), "mundo");
});

test("volver a marcar lo mismo lo desmarca", () => {
  const r = alternarMarca("hola *mundo*", 6, 11, "*");
  assert.equal(r.texto, "hola mundo");
  assert.equal(r.texto.slice(r.desde, r.hasta), "mundo");
});

test("sin seleccion deja las marcas y el cursor en medio", () => {
  // Es lo que hace cualquier editor y lo que la mano espera.
  const r = alternarMarca("hola ", 5, 5, "*");
  assert.equal(r.texto, "hola **");
  assert.equal(r.desde, 6);
  assert.equal(r.hasta, 6);
});

test("el prefijo marca todas las lineas seleccionadas", () => {
  const t = alternarPrefijo("uno\ndos\ntres", 0, 12, "> ");
  assert.equal(t, "> uno\n> dos\n> tres");
});

test("si todas estaban marcadas, se desmarcan", () => {
  const t = alternarPrefijo("> uno\n> dos", 0, 11, "> ");
  assert.equal(t, "uno\ndos");
});
