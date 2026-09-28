import test from "node:test";
import assert from "node:assert/strict";
import { LADO_MOSAICO, coordenadaUtil, mosaicoDe, planoDelMapa, urlDelMosaico } from "../lib/mapa-tienda";

/**
 * La aritmética del mapa de tienda.
 *
 * ⚠️ Estas cuentas fallan EN SILENCIO: un error en la proyección no da
 * excepción, devuelve un mapa de otro sitio. Y como la imagen se genera una vez
 * y se guarda, un mapa equivocado se queda puesto hasta que alguien lo mire y
 * reconozca que no es su calle -- que puede no pasar nunca, porque casi nadie
 * mira el mapa de la tienda donde ya trabaja.
 */

// Plaza San Agustín, San Pedro Garza García, que es la tienda real.
const SAN_AGUSTIN = { lat: 25.6512, lng: -100.3561 };

/*
 * ⚠️ Estas anclas se pueden COMPROBAR RAZONANDO, sin ejecutar el código, y por
 * eso valen. En zoom 1 el mundo son cuatro mosaicos: el 0,0 es el noroeste. Un
 * punto al norte del ecuador y al oeste de Greenwich tiene que caer ahí, y su
 * opuesto en el 1,1. Si alguien invierte un signo de la proyección, esto se
 * pone en rojo aunque los números de Monterrey se hubieran copiado de la propia
 * salida -- que es justo como se anula una prueba de aritmética sin querer.
 */
test("la proyeccion reparte el mundo por cuadrantes", () => {
  // Londres: norte y oeste -> noroeste.
  assert.deepEqual(
    { x: mosaicoDe({ lat: 51.5, lng: -0.12 }, 1).x, y: mosaicoDe({ lat: 51.5, lng: -0.12 }, 1).y },
    { x: 0, y: 0 }
  );
  // Sídney: sur y este -> sureste.
  assert.deepEqual(
    { x: mosaicoDe({ lat: -33.87, lng: 151.2 }, 1).x, y: mosaicoDe({ lat: -33.87, lng: 151.2 }, 1).y },
    { x: 1, y: 1 }
  );
  // Buenos Aires: sur y oeste -> suroeste.
  assert.deepEqual(
    { x: mosaicoDe({ lat: -34.6, lng: -58.4 }, 1).x, y: mosaicoDe({ lat: -34.6, lng: -58.4 }, 1).y },
    { x: 0, y: 1 }
  );
});

test("la proyeccion coloca la tienda donde va", () => {
  const { x, y } = mosaicoDe(SAN_AGUSTIN);
  // Calculado aparte con la fórmula de Web Mercator, no copiado de la salida.
  assert.equal(x, 14498);
  assert.equal(y, 27934);
});

test("el offset cae DENTRO del mosaico, nunca fuera", () => {
  for (const punto of [SAN_AGUSTIN, { lat: 0.0001, lng: 0.0001 }, { lat: -33.45, lng: -70.66 }, { lat: 60.17, lng: 24.94 }]) {
    const { offsetX, offsetY } = mosaicoDe(punto);
    assert.ok(offsetX >= 0 && offsetX < LADO_MOSAICO, `offsetX fuera de rango: ${offsetX}`);
    assert.ok(offsetY >= 0 && offsetY < LADO_MOSAICO, `offsetY fuera de rango: ${offsetY}`);
  }
});

test("⚠️ el plano cubre la imagen ENTERA, sin huecos", () => {
  const plano = planoDelMapa(SAN_AGUSTIN, 600, 220);
  // Cada píxel de la imagen tiene que caer dentro de algún mosaico colocado.
  for (const [px, py] of [[0, 0], [599, 0], [0, 219], [599, 219], [300, 110]]) {
    const cubierto = plano.mosaicos.some((m) =>
      px >= m.izquierda && px < m.izquierda + LADO_MOSAICO &&
      py >= m.arriba && py < m.arriba + LADO_MOSAICO
    );
    assert.ok(cubierto, `el pixel ${px},${py} se queda sin mosaico: la imagen saldria con una banda vacia`);
  }
});

test("el marcador queda en el centro de la imagen", () => {
  const plano = planoDelMapa(SAN_AGUSTIN, 600, 220);
  assert.equal(plano.marcador.x, 300);
  assert.equal(plano.marcador.y, 110);
});

test("no se piden mosaicos repetidos", () => {
  const plano = planoDelMapa(SAN_AGUSTIN, 600, 220);
  const claves = plano.mosaicos.map((m) => `${m.x}/${m.y}`);
  assert.equal(new Set(claves).size, claves.length, "se bajaria el mismo mosaico dos veces");
});

test("⚠️ la coordenada 0,0 se RECHAZA", () => {
  // Es válida --cae en el golfo de Guinea-- y es justo lo que queda cuando
  // alguien guarda el formulario vacío. Un mapa del Atlántico en la ficha de
  // una tienda de Monterrey es peor que no tener mapa: parece correcto.
  assert.equal(coordenadaUtil(0, 0), null);
  assert.equal(coordenadaUtil(null, null), null);
  assert.equal(coordenadaUtil("25.6", "-100.3"), null, "una cadena no es una coordenada");
  assert.equal(coordenadaUtil(NaN, 1), null);
  assert.equal(coordenadaUtil(95, 10), null, "fuera del rango de Mercator");
  assert.deepEqual(coordenadaUtil(SAN_AGUSTIN.lat, SAN_AGUSTIN.lng), SAN_AGUSTIN);
});

test("la url del mosaico es la de OSM", () => {
  assert.equal(
    urlDelMosaico({ x: 14498, y: 27934, zoom: 16 }),
    "https://tile.openstreetmap.org/16/14498/27934.png"
  );
});
