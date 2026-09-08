import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  esRestriccionDeLaTienda,
  faltaAlgo,
  limpiarVigencia,
  redactarComunicado,
  type PromoExtraida
} from "../lib/promo-comunicado";

/*
 * Por qué existen estas pruebas.
 *
 * ⚠️ **Esto es dinero en el mostrador.** El comunicado que sale de aquí es lo
 * que el equipo lee para saber qué descuenta y qué no. Una restricción perdida
 * o reescrita se convierte en una venta a un precio que no era, y no se nota
 * hasta el corte.
 *
 * Los dos casos torcidos salieron de correos REALES del corporativo:
 *  - el mismo correo trae `Restricciones TH 40.docx` y `Restricciones TJ 40.docx`,
 *    y solo el primero es de esta tienda;
 *  - uno terminaba con una orden subrayada --«no puede hacerse venta producto
 *    del 60% bajo esa promoción»-- que no es descuento ni exclusión y que un
 *    extractor descuidado tira.
 */

// Tomado del correo real del 1 de septiembre de 2026.
const capasBase: PromoExtraida = {
  promocion: "CAPAS BASE SEPTIEMBRE",
  vigencia: "Del 01 al 10 de septiembre 2026",
  descuentos: ["40% SPRING 2026", "40% SUMMER D1", "30% EYEWEAR", "20% JEWERLY", "40% HANDBAGS BASICOS", "10% GORRAS CADILLAC"],
  codigo: null,
  noParticipa: ["CADILLAC", "BASICOS", "SUMMER 2026 (Delivery 2 & 3)", "LICENCIAS (RELOJES Y FRAGANCIAS)", "GWP"],
  avisos: ["A partir del 1ro de septiembre, NO puede hacerse venta producto del 60% bajo esa promoción."]
};

test("las restricciones salen LITERALES, sin resumir", () => {
  const { body } = redactarComunicado(capasBase);
  // ⚠️ Lo que se comprueba es que el texto exacto sobrevive. «LICENCIAS
  // (RELOJES Y FRAGANCIAS)» resumido como «LICENCIAS» excluiría de menos.
  for (const exclusion of capasBase.noParticipa) {
    assert.ok(body.includes(exclusion), `se perdió la exclusión: ${exclusion}`);
  }
  for (const descuento of capasBase.descuentos) {
    assert.ok(body.includes(descuento), `se perdió el descuento: ${descuento}`);
  }
});

test("el aviso operativo NO se pierde y va marcado", () => {
  // ⚠️ Caso real: es una orden, no un descuento. Si se mezcla entre las demás
  // viñetas se lee por encima.
  const { body } = redactarComunicado(capasBase);
  assert.ok(body.includes("del 60% bajo esa promoción"), "se perdió el aviso operativo");
  assert.match(body, /⚠️ Importante:/, "el aviso no va marcado");
  assert.ok(
    body.indexOf("⚠️ Importante:") > body.indexOf("Mercancía que NO participa"),
    "el aviso tiene que ir al final, no entre los descuentos"
  );
});

test("la vigencia va tal cual la manda el corporativo", () => {
  const { body } = redactarComunicado(capasBase);
  assert.ok(body.includes("Del 01 al 10 de septiembre 2026"));
});

test("el titulo es el nombre de la promocion, sin adornos", () => {
  assert.equal(redactarComunicado(capasBase).title, "CAPAS BASE SEPTIEMBRE");
});

test("el codigo aparece cuando lo hay y no estorba cuando no", () => {
  // El de «Tommy Hours» del 7 de septiembre traía 750300002142.
  const conCodigo = redactarComunicado({ ...capasBase, codigo: "750300002142" });
  assert.ok(conCodigo.body.includes("750300002142"));
  assert.ok(!redactarComunicado(capasBase).body.includes("Código:"));
});

test("una lista vacia no deja un encabezado huerfano", () => {
  const { body } = redactarComunicado({ ...capasBase, noParticipa: [], avisos: [] });
  assert.ok(!body.includes("Mercancía que NO participa"), "encabezado sin contenido debajo");
  assert.ok(!body.includes("⚠️ Importante"), "encabezado sin contenido debajo");
});

test("⚠️ el archivo de TJ se RECHAZA, no se usa por parecido", () => {
  /*
   * Los dos llegan en el mismo correo y se diferencian en una letra. Sacar las
   * restricciones del equivocado es aplicar las condiciones de otra marca: se
   * descuenta lo que no se podía y se niega lo que sí.
   */
  assert.equal(esRestriccionDeLaTienda("Restricciones TH 40.docx").vale, true);
  assert.equal(esRestriccionDeLaTienda("Restricciones TJ 40.docx").vale, false);
  assert.equal(esRestriccionDeLaTienda("Restricciones TJ 40 (2).docx").vale, false);
});

test("ante la duda se para, en vez de elegir", () => {
  // Ni adivinar ni quedarse con el primero: sin certeza, no hay restricciones.
  assert.equal(esRestriccionDeLaTienda("Restricciones.docx").vale, false);
  assert.equal(esRestriccionDeLaTienda("Restricciones TH y TJ.docx").vale, false);
  assert.equal(esRestriccionDeLaTienda("").vale, false);
});

test("«TH» dentro de otra palabra no cuenta", () => {
  // Se busca la marca como palabra suelta. Sin eso, «MONTH» valdría como TH.
  assert.equal(esRestriccionDeLaTienda("Restricciones MONTH 40.docx").vale, false);
});

test("un comunicado a medias se detiene antes de publicarse", () => {
  // ⚠️ Sin vigencia la promocion parece indefinida; sin descuentos no dice nada.
  // Peor que no publicar es publicar algo que se lee como completo y no lo esta.
  assert.deepEqual(faltaAlgo(capasBase), []);
  assert.deepEqual(faltaAlgo({ ...capasBase, vigencia: "  " }), ["la vigencia"]);
  assert.deepEqual(faltaAlgo({ ...capasBase, descuentos: [] }), ["los descuentos"]);
  assert.deepEqual(faltaAlgo({ ...capasBase, promocion: "" }).length, 1);
});

test("la palabra «Vigencia» no sale dos veces", () => {
  /*
   * ⚠️ Salio en la primera prueba contra un correo REAL. El corporativo escribe
   * «Vigencia del 01 al 10 de septiembre 2026» y la plantilla pone su propio
   * encabezado: el resultado era «Vigencia: Vigencia del 01 al 10…», y es lo
   * primero que lee el equipo.
   */
  const { body } = redactarComunicado({ ...capasBase, vigencia: "Vigencia del 01 al 10 de septiembre 2026" });
  assert.ok(body.includes("Vigencia: del 01 al 10 de septiembre 2026"), body.split("\n")[0]);
  assert.ok(!body.includes("Vigencia: Vigencia"), "la palabra sale duplicada");
});

test("limpiar la vigencia NO se come las fechas", () => {
  // Solo se quita la palabra del principio. Todo lo demas va literal.
  assert.equal(limpiarVigencia("Vigencia del 07 al 09 a partir de las 2pm"), "del 07 al 09 a partir de las 2pm");
  assert.equal(limpiarVigencia("VIGENCIA: 01 al 10"), "01 al 10");
  assert.equal(limpiarVigencia("del 01 al 10"), "del 01 al 10");
  // Y «vigencia» a mitad de frase no se toca.
  assert.equal(limpiarVigencia("Del 1 al 5, sin vigencia extendida"), "Del 1 al 5, sin vigencia extendida");
});

test("⚠️ el titulo es la promocion, NO el asunto del correo", () => {
  /*
   * Tambien salio contra el correo real: el asunto era «PROMOCIONES TH
   * SEPTIEMBRE» --agrupa varias promociones del mes-- y la promocion de ESE
   * correo era «CAPAS BASE SEPTIEMBRE». Publicar el asunto como titulo hace que
   * dos comunicados distintos del mismo mes se llamen igual.
   *
   * Esto vive en el prompt, asi que se comprueba que el prompt lo diga: es lo
   * unico que se puede afirmar sin llamar al modelo.
   */
  const prompt = readFileSync(join(__dirname, "..", "lib", "promo-vision.ts"), "utf8");
  assert.match(prompt, /NO es el asunto del correo/, "el prompt no distingue el asunto del titulo");
  assert.match(prompt, /CAPAS BASE SEPTIEMBRE/, "el prompt no trae el ejemplo real que lo desambigua");
});
