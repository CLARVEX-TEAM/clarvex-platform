import assert from "node:assert/strict";
import test from "node:test";
import { exigirMapaDeBits, formatoDeImagen } from "../lib/sharp-seguro";
import { encoger } from "../lib/visual-archivos";

const SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="red"/></svg>'
);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.alloc(16)]);

test("reconoce los mapas de bits que manda Telegram", () => {
  assert.equal(formatoDeImagen(JPEG), "jpeg");
  assert.equal(formatoDeImagen(PNG), "png");
  assert.equal(formatoDeImagen(WEBP), "webp");
  assert.equal(formatoDeImagen(Buffer.from("GIF89a....")), "gif");
});

test("un SVG no es un mapa de bits", () => {
  // Es el formato del aviso de librsvg: el que no debe llegar al decodificador.
  assert.equal(formatoDeImagen(SVG), null);
  assert.throws(() => exigirMapaDeBits(SVG, "La foto"), /mapa de bits/);
});

test("el nombre del archivo no decide nada: manda el contenido", async () => {
  // Así entraría de verdad: un SVG guardado como foto.jpg en la carpeta de
  // pendientes del visual. `sharp` elige por contenido, así que la extensión
  // no protege de nada y la guarda tiene que mirar los bytes.
  await assert.rejects(() => encoger(SVG), /mapa de bits/);
});

test("basura corta no revienta la comprobación", () => {
  assert.equal(formatoDeImagen(Buffer.alloc(0)), null);
  assert.equal(formatoDeImagen(Buffer.from([0xff])), null);
  assert.equal(formatoDeImagen(Buffer.from("RIFF")), null); // trunco: no llega a decir WEBP
});

test("una foto de verdad sí pasa la guarda", () => {
  // La guarda no decodifica: solo deja seguir. Que la imagen sea válida lo
  // comprueba `sharp` después, y eso es lo correcto.
  assert.doesNotThrow(() => exigirMapaDeBits(JPEG, "La foto"));
});
