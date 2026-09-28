import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { LADO_MOSAICO } from "../lib/mapa-tienda";

/**
 * El cosido y el recorte de la imagen del mapa.
 *
 * ⚠️ Esta parte falla EN SILENCIO y de la peor forma: si el recorte se
 * desplaza, sale una imagen perfectamente válida de la calle de al lado. Nadie
 * lo nota, porque casi nadie mira con atención el mapa de la tienda donde ya
 * trabaja.
 *
 * ⚠️ El caso que se prueba es el del desplazamiento NEGATIVO. El recorte casi
 * siempre empieza a media pieza, así que el primer mosaico se coloca en una
 * coordenada negativa -- y `sharp` no admite `left`/`top` negativos. Por eso se
 * compone sobre un lienzo mayor y se recorta después, y por eso hay que
 * comprobar que el recorte cae donde debe.
 *
 * Sin red: los mosaicos se fabrican aquí con `sharp`, cada uno de un color, y
 * se comprueba dónde acaba cada color en la imagen final.
 */

const COLORES = [
  { r: 255, g: 0, b: 0 },
  { r: 0, g: 255, b: 0 },
  { r: 0, g: 0, b: 255 },
  { r: 255, g: 255, b: 0 },
  { r: 255, g: 0, b: 255 },
  { r: 0, g: 255, b: 255 },
  { r: 128, g: 128, b: 128 },
  { r: 255, g: 128, b: 0 },
  { r: 0, g: 128, b: 64 }
];

function mosaicoDeColor(indice: number) {
  const color = COLORES[indice % COLORES.length]!;
  return sharp({
    create: { width: LADO_MOSAICO, height: LADO_MOSAICO, channels: 3, background: color }
  }).png().toBuffer();
}

test("⚠️ la imagen sale del tamanio pedido, con el recorte en su sitio", async () => {
  const fetchOriginal = globalThis.fetch;
  let pedidos = 0;
  globalThis.fetch = async () => {
    const cuerpo = await mosaicoDeColor(pedidos++);
    return new Response(cuerpo, { status: 200, headers: { "Content-Type": "image/png" } });
  };
  try {
    const { armarMapaDeTienda, ANCHO_MAPA, ALTO_MAPA } = await import("../lib/mapa-tienda-imagen");
    const imagen = await armarMapaDeTienda({ lat: 25.6512, lng: -100.3561 });
    const meta = await sharp(imagen).metadata();

    assert.equal(meta.width, ANCHO_MAPA, "la imagen no tiene el ancho pedido");
    assert.equal(meta.height, ALTO_MAPA, "la imagen no tiene el alto pedido");
    assert.ok(pedidos >= 4, `se bajaron ${pedidos} mosaicos: con 640x260 hacen falta al menos 4`);
  } finally {
    globalThis.fetch = fetchOriginal;
  }
});

test("⚠️ el RECORTE cae donde debe: cada mosaico acaba en su sitio", async () => {
  /*
   * ⚠️ Esta prueba nacio mirando el alfiler, y no probaba NADA: el alfiler se
   * compone DESPUES del recorte, en el centro exacto de la imagen final, asi
   * que cae en el centro este el recorte bien o mal. Comprobaba que se dibuja
   * un circulo, no que el mapa sea el de la tienda.
   *
   * Lo que si lo prueba: pintar cada mosaico de un color derivado de SUS
   * coordenadas, y comprobar que el color que aparece en un pixel de la imagen
   * final es el del mosaico que el plano dice que lo cubre. Si el recorte se
   * desplaza aunque sea un mosaico, el color no coincide.
   */
  const { planoDelMapa } = await import("../lib/mapa-tienda");
  const centro = { lat: 25.6512, lng: -100.3561 };

  // Color unico y reproducible por mosaico.
  const colorDe = (x: number, y: number) => ({ r: (x * 37) % 256, g: (y * 59) % 256, b: 90 });

  const fetchOriginal = globalThis.fetch;
  // @ts-expect-error -- se sustituye la frontera de red a proposito
  globalThis.fetch = async (url: string) => {
    // `/16/14498/27934.png` -> ["", "16", "14498", "27934.png"]
    const [, , sx, syPng] = new URL(String(url)).pathname.split("/");
    const sy = String(syPng).replace(".png", "");
    const fondo = colorDe(Number(sx), Number(sy));
    assert.ok(Number.isFinite(fondo.r) && Number.isFinite(fondo.g), `no pude leer x/y de ${url}`);
    const cuerpo = await sharp({
      create: { width: LADO_MOSAICO, height: LADO_MOSAICO, channels: 3, background: fondo }
    }).png().toBuffer();
    return new Response(cuerpo, { status: 200 });
  };

  try {
    const { armarMapaDeTienda, ANCHO_MAPA, ALTO_MAPA } = await import("../lib/mapa-tienda-imagen");
    const plano = planoDelMapa(centro, ANCHO_MAPA, ALTO_MAPA);
    const imagen = await armarMapaDeTienda(centro);
    const { data, info } = await sharp(imagen).raw().toBuffer({ resolveWithObject: true });
    const pixel = (x: number, y: number) => {
      const i = (y * info.width + x) * info.channels;
      return { r: data[i]!, g: data[i + 1]!, b: data[i + 2]! };
    };

    // Puntos lejos del alfiler, para no leer el circulo azul.
    for (const [px, py] of [[4, 4], [ANCHO_MAPA - 5, 4], [4, ALTO_MAPA - 5], [ANCHO_MAPA - 5, ALTO_MAPA - 5]]) {
      const duenio = plano.mosaicos.find((m) =>
        px >= m.izquierda && px < m.izquierda + LADO_MOSAICO &&
        py >= m.arriba && py < m.arriba + LADO_MOSAICO
      );
      assert.ok(duenio, `el plano deja sin cubrir el pixel ${px},${py}`);
      const esperado = colorDe(duenio.x, duenio.y);
      const real = pixel(px, py);
      // JPEG al 82 % mueve los canales unas unidades; se compara con holgura.
      const distancia = Math.abs(real.r - esperado.r) + Math.abs(real.g - esperado.g) + Math.abs(real.b - esperado.b);
      assert.ok(
        distancia < 30,
        `en ${px},${py} se esperaba el mosaico ${duenio.x}/${duenio.y} ` +
          `rgb(${esperado.r},${esperado.g},${esperado.b}) y hay rgb(${real.r},${real.g},${real.b}): ` +
          "el recorte esta desplazado, asi que la imagen es de otro sitio"
      );
    }

    // Y el alfiler, que si se dibuja en el centro.
    const centroPixel = pixel(Math.floor(ANCHO_MAPA / 2), Math.floor(ALTO_MAPA / 2));
    assert.ok(centroPixel.b > 120 && centroPixel.r < 90, "falta el alfiler en el centro");
  } finally {
    globalThis.fetch = fetchOriginal;
  }
});

test("⚠️ un rechazo de OpenStreetMap se dice, no se traga", async () => {
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = async () => new Response("no", { status: 403 });
  try {
    const { armarMapaDeTienda, MapaNoDisponible } = await import("../lib/mapa-tienda-imagen");
    await assert.rejects(
      () => armarMapaDeTienda({ lat: 25.6512, lng: -100.3561 }),
      (error: Error) => {
        assert.ok(error instanceof MapaNoDisponible);
        // El 403 de OSM es su política de uso, no «no hay internet». Si el
        // mensaje no lo distingue, se busca el fallo donde no está.
        assert.match(error.message, /403|política|politica/i);
        return true;
      }
    );
  } finally {
    globalThis.fetch = fetchOriginal;
  }
});
