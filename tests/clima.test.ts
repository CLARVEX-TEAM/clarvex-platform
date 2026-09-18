import assert from "node:assert/strict";
import test from "node:test";
import { climaDelCodigo, leerRespuesta } from "../lib/clima";

/*
 * Por qué existen estas pruebas.
 *
 * El clima es un adorno, pero se pinta en el primer recuadro que ve la tienda
 * al abrir la app. Un dato mal traducido ahí no se lee como «falló el clima»:
 * se lee como que la app está rota.
 *
 * ⚠️ Y el modo de fallar que importa no es que no haya clima --eso ya está
 * cubierto: sin clima no se monta nada-- sino que llegue un número raro y se
 * pinte «NaN °C» o un sol en plena tormenta.
 */

test("traduce los codigos que de verdad manda el proveedor", () => {
  assert.equal(climaDelCodigo(0, 21.4, true).icono, "despejado");
  assert.equal(climaDelCodigo(2, 21.4, true).icono, "algo-nublado");
  assert.equal(climaDelCodigo(3, 21.4, true).icono, "nublado");
  assert.equal(climaDelCodigo(63, 18, true).icono, "lluvia");
  assert.equal(climaDelCodigo(82, 18, true).icono, "aguacero");
  assert.equal(climaDelCodigo(95, 18, true).icono, "tormenta");
  assert.equal(climaDelCodigo(95, 18, true).descripcion, "Tormenta");
});

test("los codigos HELADOS no se cuelan en el tramo de al lado", () => {
  /*
   * Esta es la razón de que la tabla sea código por código y no por rangos.
   * 56 y 57 son llovizna helada y caen entre 55 (llovizna fuerte) y 61 (lluvia
   * ligera); 66 y 67 son lluvia helada y caen entre 65 y 71 (nieve). Un rango
   * «de 51 a 60 es llovizna, de 61 a 70 lluvia» los coloca mal y nadie lo nota
   * en Monterrey, donde no hiela — hasta que la siguiente tienda no esté aquí.
   */
  for (const codigo of [56, 57]) {
    assert.equal(climaDelCodigo(codigo, -1, true).icono, "llovizna", `${codigo} es llovizna helada`);
  }
  for (const codigo of [66, 67]) {
    assert.equal(climaDelCodigo(codigo, -1, true).icono, "lluvia", `${codigo} es lluvia helada`);
  }
  assert.equal(climaDelCodigo(77, -2, true).icono, "nieve");
});

test("un codigo desconocido no inventa un dibujo, pero conserva los grados", () => {
  const raro = climaDelCodigo(4321, 27.6, true);
  assert.equal(raro.icono, "nublado", "lo más neutro que hay");
  assert.equal(raro.descripcion, "Sin detalle");
  assert.equal(raro.temperatura, 28, "la temperatura es el dato que sí se mira");
});

test("la temperatura se redondea, incluida la negativa", () => {
  assert.equal(climaDelCodigo(0, 21.4, true).temperatura, 21);
  assert.equal(climaDelCodigo(0, 21.6, true).temperatura, 22);
  assert.equal(climaDelCodigo(0, -0.4, true).temperatura, -0);
  assert.equal(climaDelCodigo(0, -2.6, true).temperatura, -3);
});

test("lee una respuesta real del proveedor", () => {
  const clima = leerRespuesta({ current: { temperature_2m: 19.7, weather_code: 3, is_day: 1 } });
  assert.deepEqual(clima, { temperatura: 20, descripcion: "Nublado", icono: "nublado", esDeDia: true });
});

test("de noche lo dice, y sin el dato asume de dia", () => {
  assert.equal(leerRespuesta({ current: { temperature_2m: 12, weather_code: 0, is_day: 0 } })?.esDeDia, false);
  // Sin `is_day` se asume de día: una luna a mediodía se ve como un fallo; un
  // sol de noche, como un detalle.
  assert.equal(leerRespuesta({ current: { temperature_2m: 12, weather_code: 0 } })?.esDeDia, true);
});

test("una respuesta incompleta devuelve null en vez de pintar NaN", () => {
  // Es el caso que de verdad puede pasar: un servicio gratuito que cambia de
  // formato, o un error suyo servido con código 200.
  assert.equal(leerRespuesta(null), null);
  assert.equal(leerRespuesta({}), null);
  assert.equal(leerRespuesta({ current: {} }), null);
  assert.equal(leerRespuesta({ current: { temperature_2m: "19.7", weather_code: 3 } }), null, "texto, no número");
  assert.equal(leerRespuesta({ current: { temperature_2m: 19.7 } }), null, "sin código de clima");
  assert.equal(leerRespuesta({ current: { temperature_2m: Number.NaN, weather_code: 3 } }), null);
});
