import assert from "node:assert/strict";
import test from "node:test";
import { mirarCadena } from "../lib/atestacion-cadena";

/*
 * Por qué existen estas pruebas, y qué NO cubren.
 *
 * ⚠️ **El camino bueno no se puede probar aquí**, y esa es precisamente la razón
 * por la que la verificación profunda todavía no está escrita: hace falta una
 * cadena real de un teléfono de la tienda. Inventar una a mano probaría el
 * invento, no a Google.
 *
 * Lo que sí se prueba, y es lo que evita que un cliente tumbe el servidor: que
 * ninguna entrada basura lance. Esto lo alimenta la APK, o sea el exterior — y
 * `new X509Certificate(basura)` LANZA. Una excepción aquí rompería el registro
 * del aparato, que es lo que sostiene las notificaciones y las funciones
 * firmadas.
 */

test("⚠️ nada de lo que mande un cliente puede LANZAR", () => {
  const basuras: unknown[] = [
    [],
    [""],
    ["no-soy-base64-!!!"],
    ["aGVsbG8="],                      // base64 válido, pero no es un certificado
    [Buffer.alloc(0).toString("base64")],
    [Buffer.alloc(9000, 1).toString("base64")], // pasado de tamaño
    Array.from({ length: 20 }, () => "aGVsbG8="), // demasiados
    null,
    undefined,
    "no soy una lista"
  ];
  for (const basura of basuras) {
    const resultado = mirarCadena(basura as string[]);
    assert.equal(resultado.ok, false, `${JSON.stringify(basura)?.slice(0, 40)} no puede pasar`);
    assert.ok(typeof (resultado as { motivo: string }).motivo === "string");
  }
});

test("una cadena vacia se lee como «no pudo», no como «no cuadra»", () => {
  /*
   * ⚠️ Importa qué palabras usa: `procedenciaDe` distingue «no pudo» de «no
   * cuadra» buscando estas marcas, y confundirlos deja a un equipo legítimo
   * fuera o a uno sospechoso dentro.
   */
  const resultado = mirarCadena([]);
  assert.equal(resultado.ok, false);
  assert.match((resultado as { motivo: string }).motivo, /no entregó cadena/);
});

test("un certificado ilegible se lee como «no cuadra»", () => {
  const resultado = mirarCadena(["aGVsbG8="]);
  assert.equal(resultado.ok, false);
  assert.match((resultado as { motivo: string }).motivo, /no se pudo leer/);
});

test("el tope de certificados se dice con su numero", () => {
  const resultado = mirarCadena(Array.from({ length: 12 }, () => "aGVsbG8="));
  assert.match((resultado as { motivo: string }).motivo, /12 certificados/);
});
