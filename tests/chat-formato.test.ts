import assert from "node:assert/strict";
import test from "node:test";
import { alternarMarca, alternarPrefijo, bloques, textoLlano, trozos } from "../lib/chat-formato";

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

test("la vista previa va sin marcas", () => {
  // En una fila de una linea, «*Hola*» con asteriscos se lee peor que sin
  // ellos, y una cita con viñetas se vuelve un amasijo de `>` y `-`.
  assert.equal(textoLlano("*Hola* a todos"), "Hola a todos");
  assert.equal(textoLlano("> Adicional como ya les dije"), "Adicional como ya les dije");
  assert.equal(textoLlano("- uno\n- dos"), "uno dos");
  assert.equal(textoLlano("`SELECT 1`"), "SELECT 1");
});

test("la vista previa aplana los saltos de linea", () => {
  assert.equal(textoLlano("hola\n\nadios"), "hola adios");
});

/* ─── enlaces ─────────────────────────────────────────────────────────────── */

test("un enlace con etiqueta pinta el texto y guarda el destino", () => {
  const t = trozos("<https://www.crehana.com/clases/v2/90538|CURSO CREHANA>");
  assert.deepEqual(t, [
    { tipo: "enlace", texto: "CURSO CREHANA", url: "https://www.crehana.com/clases/v2/90538" }
  ]);
});

test("una direccion pegada a secas tambien queda pulsable", () => {
  const t = trozos("mira https://clarvex.tech ahora");
  assert.deepEqual(t, [
    { tipo: "texto", texto: "mira " },
    { tipo: "enlace", texto: "https://clarvex.tech", url: "https://clarvex.tech" },
    { tipo: "texto", texto: " ahora" }
  ]);
});

test("⚠️ SOLO http y https: nada de javascript: ni data:", () => {
  /*
   * Un `href` con javascript: ejecuta codigo en la pantalla de quien lo pulse,
   * y aqui el cuerpo lo escriben doce personas. La unica puerta es `leerEnlace`:
   * si el esquema no esta en la expresion regular, no hay enlace y se queda
   * como texto.
   */
  for (const veneno of [
    "<javascript:alert(1)|pulsa aqui>",
    "<data:text/html,<script>alert(1)</script>|informe>",
    "<vbscript:msgbox|hola>",
    "<JaVaScRiPt:alert(1)|disfrazado>"
  ]) {
    const t = trozos(veneno);
    assert.equal(t.some((x) => x.tipo === "enlace"), false, `se colo: ${veneno}`);
  }
});

test("⚠️ la puntuacion final no es del enlace", () => {
  // «Miralo en https://clarvex.tech.» acaba en punto, y meterlo dentro da una
  // direccion que no existe.
  const t = trozos("miralo en https://clarvex.tech.");
  const enlace = t.find((x) => x.tipo === "enlace");
  assert.ok(enlace && enlace.tipo === "enlace");
  assert.equal(enlace.url, "https://clarvex.tech");
  assert.deepEqual(t[t.length - 1], { tipo: "texto", texto: "." });
});

test("un parentesis que SI se abrio dentro se conserva", () => {
  const t = trozos("https://es.wikipedia.org/wiki/Monterrey_(Nuevo_Leon)");
  const enlace = t.find((x) => x.tipo === "enlace");
  assert.ok(enlace && enlace.tipo === "enlace");
  assert.equal(enlace.url, "https://es.wikipedia.org/wiki/Monterrey_(Nuevo_Leon)");
});

test("⚠️ una URL con guiones bajos no se parte en cursiva", () => {
  // Las URLs traen `_` y `*` con toda normalidad. Mirandolos primero como
  // marcas, el enlace se corta por la mitad y deja de funcionar.
  const t = trozos("https://x.com/a_b_c/d");
  assert.deepEqual(t, [
    { tipo: "enlace", texto: "https://x.com/a_b_c/d", url: "https://x.com/a_b_c/d" }
  ]);
});

test("dentro de codigo una direccion NO se vuelve pulsable", () => {
  // Es para lo que sirve el codigo: poder enseñar una direccion sin activarla.
  const t = trozos("usa `https://clarvex.tech` como base");
  assert.equal(t.some((x) => x.tipo === "enlace"), false);
  assert.deepEqual(t[1], { tipo: "codigo", texto: "https://clarvex.tech" });
});

test("la vista previa enseña la etiqueta, no la direccion", () => {
  // Es lo que se ve en la lista de chats y en la notificacion: una URL larga
  // ahi no dice nada.
  assert.equal(textoLlano("<https://www.crehana.com/clases/v2/90538|CURSO CREHANA>"), "CURSO CREHANA");
});

test("un enlace sin etiqueta enseña la direccion", () => {
  assert.equal(textoLlano("<https://clarvex.tech>"), "https://clarvex.tech");
});
