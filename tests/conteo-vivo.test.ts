import assert from "node:assert/strict";
import test from "node:test";
import { huellaDelDia, type MarcasDeEntrada } from "../lib/conteo-vivo";

const entrada = (tagId: string, ...marcas: Array<Date | null>): MarcasDeEntrada => ({
  tagId,
  count1At: marcas[0] ?? null,
  count2At: marcas[1] ?? null,
  count3At: marcas[2] ?? null
});

const T1 = new Date("2026-09-03T10:00:00.000Z");
const T2 = new Date("2026-09-03T10:05:00.000Z");
const T3 = new Date("2026-09-03T10:09:00.000Z");

test("sin nada contado la huella es estable", () => {
  assert.equal(huellaDelDia([]), huellaDelDia([]));
});

test("contar un marbete cambia la huella", () => {
  const antes = huellaDelDia([entrada("a")]);
  const despues = huellaDelDia([entrada("a", T1)]);
  assert.notEqual(antes, despues);
});

test("⚠️ CORREGIR un marbete ya contado tambien cambia la huella", () => {
  /*
   * Aqui es donde no basta con contar capturas: siguen siendo las mismas. Lo
   * que se mueve es el instante. Sin esto, una correccion no llegaria a las
   * demas pantallas y cada una veria un numero distinto.
   */
  const antes = huellaDelDia([entrada("a", T1)]);
  const despues = huellaDelDia([entrada("a", T2)]);
  assert.notEqual(antes, despues);
});

test("⚠️ BORRAR una captura tambien cambia la huella", () => {
  /*
   * Y aqui es donde no basta con el ultimo instante: al quitar la mas reciente,
   * la que queda es anterior, y un recuento corregido podria dejar el instante
   * exactamente igual que antes. Lo que se mueve es el numero de capturas.
   */
  const antes = huellaDelDia([entrada("a", T1, T2)]);
  const despues = huellaDelDia([entrada("a", T1)]);
  assert.notEqual(antes, despues);
});

test("añadir un marbete nuevo al juego cambia la huella", () => {
  const antes = huellaDelDia([entrada("a", T1)]);
  const despues = huellaDelDia([entrada("a", T1), entrada("b")]);
  assert.notEqual(antes, despues);
});

test("sin novedades la huella se repite: no se recarga porque si", () => {
  const filas = [entrada("a", T1, T2), entrada("b", T3)];
  assert.equal(huellaDelDia(filas), huellaDelDia(filas.map((f) => ({ ...f }))));
});

test("el orden de las filas no la altera", () => {
  const a = entrada("a", T1);
  const b = entrada("b", T3);
  assert.equal(huellaDelDia([a, b]), huellaDelDia([b, a]));
});

test("⚠️ la huella NO lleva ninguna cantidad", () => {
  /*
   * El conteo es ciego: lo que otra persona acaba de teclear es justo lo que no
   * puede salir. La huella se arma solo con cuantas capturas hay y cuando fue
   * la ultima, asi que ningun numero de piezas puede deducirse de ella.
   *
   * Se comprueba por construccion: el tipo de entrada no tiene ni un campo de
   * cantidad, y la huella son tres numeros con significado propio.
   */
  const partes = huellaDelDia([entrada("a", T1, T2)]).split(":");
  assert.equal(partes.length, 3);
  assert.equal(partes[0], "1"); // marbetes
  assert.equal(partes[1], "2"); // capturas
  assert.equal(partes[2], String(T2.getTime())); // ultima
});
