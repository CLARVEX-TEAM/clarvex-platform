import sharp from "sharp";
import { LADO_MOSAICO, planoDelMapa, urlDelMosaico, type Coordenada } from "./mapa-tienda";

/**
 * Arma la imagen del mapa de una tienda a partir de los mosaicos de OSM.
 *
 * ⚠️ Esto corre UNA VEZ por tienda, cuando gerencia guarda sus coordenadas, y
 * el resultado se sube a R2. No se llama al pintar la pantalla. Ver la cabecera
 * de `lib/mapa-tienda.ts` para por qué.
 *
 * Va aparte de la aritmética a propósito: aquí sí hay red y sí hay `sharp`, así
 * que esto no se puede probar sin fronteras simuladas; las cuentas, que son lo
 * que falla en silencio, viven en el otro archivo y sí tienen pruebas.
 */

export const ANCHO_MAPA = 640;
export const ALTO_MAPA = 260;

/**
 * ⚠️ OpenStreetMap EXIGE un agente propio e identificable, con forma de
 * contacto. Con el de una librería genérica --o sin ninguno-- bloquean, y el
 * bloqueo llega como un 403 que se parece a cualquier otro fallo de red.
 * Su política: https://operations.osmfoundation.org/policies/tiles/
 */
const AGENTE = "ClarvexTeam/1.0 (mapa de tienda, una vez por tienda; contacto@clarvex.tech)";

/** Cuánto se espera a un mosaico antes de darlo por perdido. */
const ESPERA_MS = 12_000;

export class MapaNoDisponible extends Error {
  constructor(motivo: string) {
    super(motivo);
    this.name = "MapaNoDisponible";
  }
}

async function bajarMosaico(url: string): Promise<Buffer> {
  const corte = AbortSignal.timeout(ESPERA_MS);
  const respuesta = await fetch(url, { headers: { "User-Agent": AGENTE }, signal: corte, cache: "no-store" });
  if (!respuesta.ok) {
    throw new MapaNoDisponible(
      respuesta.status === 403
        ? "OpenStreetMap rechazó la petición (403). Suele ser su política de uso de mosaicos."
        : `OpenStreetMap respondió ${respuesta.status} al pedir un mosaico.`
    );
  }
  return Buffer.from(await respuesta.arrayBuffer());
}

/**
 * El alfiler de la tienda. Va en SVG para que `sharp` lo componga encima sin
 * depender de ninguna fuente ni de ningún archivo del disco.
 */
function alfiler(x: number, y: number) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${ANCHO_MAPA}" height="${ALTO_MAPA}">` +
      // Halo blanco para que se vea sobre un mapa claro y sobre uno con parque.
      `<circle cx="${x}" cy="${y}" r="11" fill="#FFFFFF" fill-opacity="0.95"/>` +
      `<circle cx="${x}" cy="${y}" r="7" fill="#1458BD"/>` +
      `</svg>`
  );
}

export async function armarMapaDeTienda(centro: Coordenada): Promise<Buffer> {
  const plano = planoDelMapa(centro, ANCHO_MAPA, ALTO_MAPA);
  if (plano.mosaicos.length === 0) throw new MapaNoDisponible("No hay mosaicos para esa coordenada.");

  /*
   * ⚠️ Los mosaicos se bajan DE UNO EN UNO, no en paralelo.
   *
   * Son seis o nueve y esto corre una sola vez por tienda, así que la
   * diferencia de tiempo no la nota nadie; en cambio nueve peticiones
   * simultáneas a los servidores gratuitos de OSM es exactamente lo que su
   * política pide no hacer.
   */
  const piezas: Array<{ input: Buffer; left: number; top: number }> = [];
  for (const mosaico of plano.mosaicos) {
    piezas.push({
      input: await bajarMosaico(urlDelMosaico(mosaico)),
      left: mosaico.izquierda,
      top: mosaico.arriba
    });
  }

  /*
   * ⚠️ El lienzo se crea del tamaño FINAL y los mosaicos se pegan con
   * coordenadas que pueden ser negativas --el primero casi siempre lo es,
   * porque el recorte empieza a media pieza--. `sharp` no admite `left`/`top`
   * negativos, así que se compone sobre un lienzo mayor y se recorta después.
   */
  const desplazamientoX = Math.min(0, ...piezas.map((p) => p.left));
  const desplazamientoY = Math.min(0, ...piezas.map((p) => p.top));
  const anchoLienzo = Math.max(...piezas.map((p) => p.left + LADO_MOSAICO)) - desplazamientoX;
  const altoLienzo = Math.max(...piezas.map((p) => p.top + LADO_MOSAICO)) - desplazamientoY;

  const pegado = await sharp({
    create: { width: anchoLienzo, height: altoLienzo, channels: 3, background: "#E8E8E4" }
  })
    .composite(piezas.map((p) => ({ input: p.input, left: p.left - desplazamientoX, top: p.top - desplazamientoY })))
    .png()
    .toBuffer();

  return sharp(pegado)
    .extract({ left: -desplazamientoX, top: -desplazamientoY, width: ANCHO_MAPA, height: ALTO_MAPA })
    .composite([{ input: alfiler(plano.marcador.x, plano.marcador.y), left: 0, top: 0 }])
    // JPEG y no PNG: un mapa es una foto, y en PNG pesa seis veces más para
    // que lo baje un teléfono con la señal del centro comercial.
    .jpeg({ quality: 82 })
    .toBuffer();
}
