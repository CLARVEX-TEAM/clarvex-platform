import assert from "node:assert/strict";
import test from "node:test";
import {
  contraparteDe,
  cuadraLaPagina,
  enQueDifieren,
  problemasDeHoja,
  type HojaTraspaso
} from "../lib/traspaso-hoja";

/*
 * La hoja REAL del traspaso 1767557, del 9 de septiembre de 2026.
 *
 * ⚠️ Los renglones visibles suman 23 y el encabezado dice 48: la hoja sigue en
 * la pagina siguiente y solo llega la primera. Por eso NO hay una cuenta que
 * cierre, y por eso la comprobacion real es leer con dos modelos distintos.
 */
const TIENDA = "03029";

const HOJA: HojaTraspaso = {
  folio: "1767557",
  direccion: "SALIDA",
  origen: "03029",
  destino: "03000",
  piezas: 48,
  fechaImpresa: "2026-09-09",
  renglones: [1, 2, 4, 1, 1, 3, 3, 1, 1, 1, 1, 2, 1, 1]
};

test("la hoja real se acepta", () => {
  assert.deepEqual(problemasDeHoja(HOJA, TIENDA), []);
});

test("⚠️ el 03000 de la hoja resuelve al CEDIS", () => {
  // La hoja imprime «03000 - TOMMY» y el kardex de papel lo llama CEDIS. Sin la
  // equivalencia, el traspaso se rechazaria por contraparte desconocida.
  const contraparte = contraparteDe(HOJA);
  assert.equal(contraparte?.code, "CEDIS");
});

test("los renglones de UNA pagina no cuadran, y eso es lo normal", () => {
  // 23 de 48: la hoja sigue. No es un error; es que no hay comprobacion.
  assert.equal(cuadraLaPagina(HOJA), false);
});

test("cuando el traspaso cabe en una hoja, la cuenta SI cierra", () => {
  const deUnaPagina: HojaTraspaso = { ...HOJA, piezas: 6, renglones: [1, 2, 3] };
  assert.equal(cuadraLaPagina(deUnaPagina), true);
  assert.deepEqual(problemasDeHoja(deUnaPagina, TIENDA), []);
});

test("⚠️ si los renglones se PASAN del total, el total esta mal leido", () => {
  /*
   * Los renglones de una pagina pueden sumar menos que el total --lo normal--
   * pero nunca mas. Es la unica cuenta que la hoja ofrece por si sola, sale
   * gratis, y caza el caso en que el total se leyo de menos: 48 como 43.
   */
  const totalDeMenos: HojaTraspaso = { ...HOJA, piezas: 10 };
  const problemas = problemasDeHoja(totalDeMenos, TIENDA);
  assert.equal(problemas.length, 1, JSON.stringify(problemas));
  assert.match(problemas[0], /suman 23 y el encabezado dice 10/);
});

test("⚠️ una hoja de OTRA tienda se rechaza", () => {
  /*
   * Capturar el traspaso de otra tienda mueve piezas que nunca pasaron por
   * aqui, y el kardex no tiene forma de enterarse: el descuadre sale en el
   * conteo fisico, sin rastro de donde vino.
   */
  const ajena: HojaTraspaso = { ...HOJA, origen: "03009" };
  const problemas = problemasDeHoja(ajena, TIENDA);
  assert.equal(problemas.length, 1, JSON.stringify(problemas));
  assert.match(problemas[0], /es de la tienda 03009, no de la tuya/);
});

test("en una ENTRADA la tienda va del otro lado", () => {
  // Su tienda es la de recepcion, y la contraparte la de envio.
  const entrada: HojaTraspaso = { ...HOJA, direccion: "ENTRADA", origen: "03000", destino: "03029" };
  assert.deepEqual(problemasDeHoja(entrada, TIENDA), []);
    assert.equal(contraparteDe(entrada)?.code, "CEDIS");

  // Y la misma hoja marcada al reves ya no es suya.
  const alReves: HojaTraspaso = { ...HOJA, direccion: "ENTRADA" };
  assert.ok(problemasDeHoja(alReves, TIENDA).some((p) => /no de la tuya/.test(p)));
});

test("un destino fuera del catalogo se rechaza en vez de inventarse", () => {
  const raro: HojaTraspaso = { ...HOJA, destino: "09999" };
  assert.ok(problemasDeHoja(raro, TIENDA).some((p) => /no está en el catálogo/.test(p)));
  assert.equal(contraparteDe(raro), null);
});

test("folio, piezas y fecha tienen que venir enteros", () => {
  assert.ok(problemasDeHoja({ ...HOJA, folio: "17—557" }, TIENDA).some((p) => /no parece un número/.test(p)));
  assert.ok(problemasDeHoja({ ...HOJA, piezas: 0 }, TIENDA).some((p) => /entero positivo/.test(p)));
  assert.ok(problemasDeHoja({ ...HOJA, piezas: 4.5 }, TIENDA).some((p) => /entero positivo/.test(p)));
  assert.ok(problemasDeHoja({ ...HOJA, fechaImpresa: null }, TIENDA).length === 0, "la fecha impresa no decide nada");
});

/* ─── Las dos lecturas ───────────────────────────────────────────────────── */

test("dos lecturas iguales no reportan nada", () => {
  assert.deepEqual(enQueDifieren(HOJA, { ...HOJA }), []);
});

test("⚠️ un digito distinto en las PIEZAS se reporta", () => {
  /*
   * Es el error que nada mas puede cazar: 48 leido como 43. Medido el 9 de
   * septiembre de 2026, Haiku y Sonnet fallaron una vez cada uno sobre los
   * mismos cinco reportes del POS, y en sitios DISTINTOS: sus erratas son
   * independientes, asi que coincidir en el mismo numero equivocado es mucho
   * menos probable que equivocarse.
   */
  const diferencias = enQueDifieren(HOJA, { ...HOJA, piezas: 43 });
  assert.equal(diferencias.length, 1);
  assert.match(diferencias[0], /las piezas/);
  assert.match(diferencias[0], /48/);
  assert.match(diferencias[0], /43/);
});

test("tambien se comparan folio, sentido, ubicaciones y fecha", () => {
  assert.equal(enQueDifieren(HOJA, { ...HOJA, folio: "1767558" }).length, 1);
  assert.equal(enQueDifieren(HOJA, { ...HOJA, direccion: "ENTRADA" }).length, 1);
  assert.equal(enQueDifieren(HOJA, { ...HOJA, destino: "03009" }).length, 1);
  assert.equal(enQueDifieren(HOJA, { ...HOJA, fechaImpresa: "2026-09-08" }).length, 0, "la fecha impresa NO decide");
});

test("⚠️ los RENGLONES no se comparan entre lecturas", () => {
  /*
   * Un renglon que un modelo ve y el otro no --porque la foto corta la tabla
   * por abajo-- no cambia nada de lo que se guarda. Exigir que coincidan
   * rechazaria fotos buenas todo el tiempo, y un aviso que salta siempre deja
   * de leerse.
   */
  assert.deepEqual(enQueDifieren(HOJA, { ...HOJA, renglones: [1, 2] }), []);
});

test("el formato no cuenta como discrepancia", () => {
  // Dos lecturas del mismo numero no pueden discrepar por espacios ni mayusculas.
  assert.deepEqual(enQueDifieren(HOJA, { ...HOJA, folio: " 1767557 ", destino: "03000 " }), []);
});

test("⚠️ sin APTO no se compara la tienda, y no se inventa un problema", () => {
  /*
   * `Store` todavia no guarda el APTO, asi que llega de fuera y puede faltar.
   * Comparar contra una cadena vacia rechazaria TODAS las hojas con un mensaje
   * absurdo --«la hoja es de la tienda 03029, no de la tuya ()»-- y quien
   * captura buscaria el fallo en el papel.
   */
  assert.deepEqual(problemasDeHoja(HOJA, ""), []);
  assert.deepEqual(problemasDeHoja(HOJA, "   "), []);
  // Y la hoja de otra tienda tampoco se rechaza: no hay contra que compararla.
  assert.deepEqual(problemasDeHoja({ ...HOJA, origen: "03009" }, ""), []);
});

test("⚠️ la fecha IMPRESA no decide nada y nunca detiene una hoja", () => {
  /*
   * La que imprime el papel es la de IMPRESION, y su campo «Fecha en que se
   * despacho» viene EN BLANCO. El movimiento se fecha el dia en que la tienda
   * captura --lo decide la ruta con la zona de Monterrey--, asi que esta solo
   * viaja para enseñarla.
   *
   * Por eso ni se comprueba su formato ni se exige que las dos lecturas
   * coincidan: rechazar por ella seria detener un traspaso bueno por un dato
   * que no se guarda, y un candado que rechaza sin nada en juego solo enseña a
   * desconfiar de los candados.
   */
  assert.deepEqual(problemasDeHoja({ ...HOJA, fechaImpresa: null }, TIENDA), []);
  assert.deepEqual(problemasDeHoja({ ...HOJA, fechaImpresa: "9/9/2026" }, TIENDA), []);
  assert.deepEqual(enQueDifieren(HOJA, { ...HOJA, fechaImpresa: null }), []);
  assert.deepEqual(enQueDifieren(HOJA, { ...HOJA, fechaImpresa: "2026-01-01" }), []);
});
