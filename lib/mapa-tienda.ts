/**
 * El mapa de la tienda, como ARCHIVO y no como servicio en vivo.
 *
 * ⚠️ La ubicación de una tienda no cambia nunca, así que pedir el mapa cada vez
 * que alguien abre la pantalla sería pedir lo mismo doscientas veces al día. Se
 * arma UNA vez desde los mosaicos de OpenStreetMap, se guarda en R2 y se sirve
 * como cualquier otra imagen del proyecto. Eso resuelve tres cosas a la vez:
 *
 *   1. **La señal del centro comercial se cae a diario.** Un mapa que se pide en
 *      vivo dejaría un hueco gris en la tarjeta justo los días malos; uno
 *      guardado se comporta como el resto de las imágenes.
 *   2. **La CSP no se toca.** R2 ya está en `img-src`; abrirla a un servidor de
 *      mapas de terceros sería ampliar la superficie por una miniatura.
 *   3. **La política de uso de OSM se respeta.** Sus mosaicos son gratuitos pero
 *      no son un CDN: una petición por tienda y para siempre es aceptable; una
 *      por apertura de pantalla, no.
 *
 * Este archivo NO toca la red ni Prisma a propósito: es aritmética, y así se
 * puede probar. Quien descarga los mosaicos es el endpoint que lo usa.
 */

/** Tamaño de un mosaico de OSM, fijo por el estándar. */
export const LADO_MOSAICO = 256;

/**
 * Zoom 16: la manzana y las calles con nombre alrededor.
 *
 * Más cerca (18) se ve el local pero no se reconoce dónde está; más lejos (14)
 * se reconoce la ciudad pero no la tienda. 16 es donde se lee «está en esta
 * esquina», que es lo que contesta la tarjeta.
 */
export const ZOOM = 16;

export type Coordenada = { lat: number; lng: number };

/**
 * En qué mosaico cae una coordenada, y en qué píxel DENTRO de ese mosaico.
 *
 * Es la proyección Web Mercator estándar. Se devuelve la parte entera y la
 * fracción por separado porque las dos hacen falta: la entera dice qué archivos
 * bajar, y la fracción dónde recortar para que la tienda quede centrada.
 */
export function mosaicoDe({ lat, lng }: Coordenada, zoom = ZOOM) {
  const n = 2 ** zoom;
  const latRad = (lat * Math.PI) / 180;
  const x = ((lng + 180) / 360) * n;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return {
    x: Math.floor(x),
    y: Math.floor(y),
    // Píxel dentro del mosaico, de 0 a 255.
    offsetX: Math.floor((x - Math.floor(x)) * LADO_MOSAICO),
    offsetY: Math.floor((y - Math.floor(y)) * LADO_MOSAICO)
  };
}

/**
 * Qué mosaicos bajar y cómo recortarlos para que salga una imagen de
 * `ancho × alto` con la tienda en el centro.
 *
 * ⚠️ Se piden los mosaicos de un cuadro COMPLETO alrededor, no solo el que
 * contiene la tienda. Si la tienda cae cerca del borde de su mosaico --y cae
 * donde caiga, no se elige-- recortar solo ese deja media imagen vacía.
 */
export function planoDelMapa(centro: Coordenada, ancho: number, alto: number, zoom = ZOOM) {
  const { x, y, offsetX, offsetY } = mosaicoDe(centro, zoom);

  // Píxel del centro dentro de la rejilla global de mosaicos.
  const centroGlobalX = x * LADO_MOSAICO + offsetX;
  const centroGlobalY = y * LADO_MOSAICO + offsetY;

  // Esquina superior izquierda del recorte, en esa misma rejilla.
  const izquierda = centroGlobalX - Math.floor(ancho / 2);
  const arriba = centroGlobalY - Math.floor(alto / 2);

  const primerMosaicoX = Math.floor(izquierda / LADO_MOSAICO);
  const primerMosaicoY = Math.floor(arriba / LADO_MOSAICO);
  const ultimoMosaicoX = Math.floor((izquierda + ancho - 1) / LADO_MOSAICO);
  const ultimoMosaicoY = Math.floor((arriba + alto - 1) / LADO_MOSAICO);

  const mosaicos: Array<{ x: number; y: number; zoom: number; izquierda: number; arriba: number }> = [];
  const total = 2 ** zoom;
  for (let mx = primerMosaicoX; mx <= ultimoMosaicoX; mx += 1) {
    for (let my = primerMosaicoY; my <= ultimoMosaicoY; my += 1) {
      // Fuera de la rejilla no hay mosaico: en los polos, `y` se sale.
      if (my < 0 || my >= total) continue;
      mosaicos.push({
        // La rejilla da la vuelta en X: el meridiano 180 es continuo.
        x: ((mx % total) + total) % total,
        y: my,
        zoom,
        // Dónde va pegado dentro de la imagen final.
        izquierda: mx * LADO_MOSAICO - izquierda,
        arriba: my * LADO_MOSAICO - arriba
      });
    }
  }

  return {
    ancho,
    alto,
    mosaicos,
    /** Dónde cae la tienda dentro de la imagen final. */
    marcador: { x: centroGlobalX - izquierda, y: centroGlobalY - arriba }
  };
}

/**
 * La URL de un mosaico.
 *
 * ⚠️ OSM EXIGE un `User-Agent` propio e identificable en cada petición; con el
 * de una librería genérica bloquean por política de uso. Lo pone quien
 * descarga, no esta función, pero queda dicho aquí porque es donde se busca.
 */
export function urlDelMosaico(mosaico: { x: number; y: number; zoom: number }) {
  return `https://tile.openstreetmap.org/${mosaico.zoom}/${mosaico.x}/${mosaico.y}.png`;
}

/**
 * ¿Es una coordenada utilizable?
 *
 * ⚠️ El `0, 0` se rechaza a propósito. Es una coordenada válida --cae en el
 * golfo de Guinea-- y es exactamente lo que queda cuando alguien guarda el
 * formulario sin escribir nada y los campos vacíos se convierten en número.
 * Un mapa del Atlántico en la ficha de una tienda de Monterrey es peor que no
 * tener mapa: parece que el dato está bien.
 */
export function coordenadaUtil(lat: unknown, lng: unknown): Coordenada | null {
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat === 0 && lng === 0) return null;
  if (lat < -85 || lat > 85) return null;
  if (lng < -180 || lng > 180) return null;
  return { lat, lng };
}
