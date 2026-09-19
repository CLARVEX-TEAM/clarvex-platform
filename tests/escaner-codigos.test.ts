import assert from "node:assert/strict";
import test from "node:test";
import { decidirLectura } from "../lib/escaner-codigos";

/*
 * Por qué existen estas pruebas.
 *
 * El lector nativo llega en APK 1.8 porque ⚠️ **el WebView no trae
 * `BarcodeDetector`** --es una función de Chrome, no del contenedor--, así que
 * dentro de la APK el escáner web cae siempre a jsQR y decodifica cuadro por
 * cuadro en JavaScript sobre vídeo de 1080p. Se lee como «el escáner no sirve»
 * en el teléfono de la tienda y perfecto en el navegador, siendo la misma
 * pantalla. Es el mismo patrón que las notificaciones y las barras del sistema.
 *
 * Los cuatro finales se parecen desde fuera y confundir dos cuesta caro:
 * quedarse sin poder contar, o un escáner que parece roto.
 */

const cruda = (valor: string) => ({ disponible: true, cancelado: false, valor });

test("un marbete de esta tienda se lee y se captura", () => {
  assert.deepEqual(decidirLectura(cruda("CLVX:M:47")), { accion: "marbete", numero: 47 });
});

test("⚠️ sin lector nativo se cae al escaner WEB, no se falla", () => {
  /*
   * Un teléfono sin servicios de Google no puede abrir el lector del sistema. Si
   * eso se tratara como un error, ese aparato se quedaría sin poder contar — y
   * el escáner web ya funciona ahí.
   */
  assert.deepEqual(
    decidirLectura({ disponible: false, cancelado: true, valor: "", motivo: "sin servicios de Google" }),
    { accion: "web" }
  );
});

test("cerrar el escaner NO es un fallo", () => {
  // Es una decisión de la persona. Tratarla como error le enseñaría un aviso
  // rojo por haber tocado la equis.
  assert.deepEqual(decidirLectura({ disponible: true, cancelado: true, valor: "" }), { accion: "cerrar" });
  assert.deepEqual(decidirLectura({ disponible: true, cancelado: false, valor: "" }), { accion: "cerrar" });
});

test("⚠️ un codigo AJENO se dice, no se ignora", () => {
  /*
   * Los muebles llevan códigos de todo: la etiqueta del proveedor, un código de
   * barras de la prenda, un QR de garantía. Leer uno y no hacer nada se ve
   * exactamente igual que un escáner roto, y la persona vuelve a intentarlo con
   * el mismo código.
   */
  assert.deepEqual(decidirLectura(cruda("7501234567890")), { accion: "ajeno" }, "código de barras de producto");
  assert.deepEqual(decidirLectura(cruda("https://ejemplo.mx/garantia")), { accion: "ajeno" }, "un QR cualquiera");
  assert.deepEqual(decidirLectura(cruda("CLVX:M:")), { accion: "ajeno" }, "el prefijo sin número");
  assert.deepEqual(decidirLectura(cruda("CLVX:M:0")), { accion: "ajeno" }, "no hay marbete cero");
  assert.deepEqual(decidirLectura(cruda("CLVX:M:-3")), { accion: "ajeno" }, "ni negativo");
});

test("el marbete lo decide la WEB, no el plugin", () => {
  /*
   * El nativo devuelve el texto crudo a propósito. Si el plugin interpretara el
   * marbete, la regla viviría repartida entre dos repositorios y se separarían
   * — como ya pasó con el id del canal de notificaciones.
   */
  assert.deepEqual(decidirLectura(cruda("CLVX:M:1")), { accion: "marbete", numero: 1 });
  assert.deepEqual(decidirLectura(cruda("clvx:m:1")), { accion: "ajeno" }, "distingue mayúsculas, como siempre");
});
