import assert from "node:assert/strict";
import test from "node:test";

import { diezDigitosDelRemitente } from "@/lib/whatsapp-telefono";

/*
 * Por qué existen estas pruebas.
 *
 * ⚠️ El bot se probó el 6 de noviembre de 2026 con un número escrito `52…`, que
 * es como lo guarda `UserPhone`, y respondió. Los mensajes reales llegan
 * `521…`, así que en un teléfono de verdad no contestaba a nadie y no quedaba
 * ni un error en el log. Los números de aquí son inventados.
 */

test("un celular mexicano 521 coincide con el 52 guardado", () => {
  assert.equal(diezDigitosDelRemitente("5218100000001@s.whatsapp.net"), "8100000001");
  assert.equal(diezDigitosDelRemitente("528100000001@s.whatsapp.net"), "8100000001");
});

test("ignora el sufijo de dispositivo", () => {
  assert.equal(diezDigitosDelRemitente("5218100000001:12@s.whatsapp.net"), "8100000001");
});

test("un @lid se resuelve con remoteJidAlt, nunca con sus propios dígitos", () => {
  assert.equal(diezDigitosDelRemitente("141420000000000@lid", "5218100000001@s.whatsapp.net"), "8100000001");
  assert.equal(diezDigitosDelRemitente("141420000000000@lid"), null);
  assert.equal(diezDigitosDelRemitente("141420000000000@lid", null), null);
});

test("sin número reconocible no inventa un remitente", () => {
  assert.equal(diezDigitosDelRemitente("123@s.whatsapp.net"), null);
  assert.equal(diezDigitosDelRemitente(""), null);
});
