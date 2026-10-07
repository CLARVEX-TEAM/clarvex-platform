/**
 * Guarda de formato para las imágenes que llegan de fuera.
 *
 * ⚠️ **Por qué existe.** El 7 de octubre de 2026 la auditoría marcó
 * GHSA-wq5f-xc86-pv6w (CVE-2026-96889, CVSS 8.9): un fallo de memoria en
 * **librsvg**, el decodificador de SVG que usa `sharp`, que en Linux con glibc
 * puede llegar a **ejecución remota de código**. Se parchea subiendo a 0.35.5,
 * y eso ya está hecho — pero el parche cierra ESE fallo, no el siguiente.
 *
 * Las fotos del reporte visual llegan por Telegram desde la tienda y se
 * escriben en `/home/ubuntu/visual/pendientes` sin que nadie las revise: son
 * entrada no confiable. Y `sharp` elige el decodificador por el CONTENIDO del
 * archivo, no por su extensión, así que un archivo llamado `.jpg` que por
 * dentro sea SVG entra igual por librsvg.
 *
 * ⚠️ **Y NO sirve apagar el SVG en todo el proceso.** `sharp.block()` es global,
 * y `lib/mapa-tienda-imagen.ts` compone el alfiler del mapa con un SVG que
 * generamos nosotros en código. Apagarlo de golpe rompe el mapa —lo descubrí
 * rompiéndolo: dos pruebas en rojo— y además castigaría a un SVG de confianza
 * por culpa de otro que no lo es.
 *
 * Por eso la guarda va donde está el riesgo y mira los BYTES, no la extensión:
 * si no empieza como JPEG, PNG, WebP o GIF, `sharp` no lo ve nunca.
 */

/** Lo que de verdad manda Telegram: mapas de bits. Nada de SVG ni contenedores. */
const FIRMAS: ReadonlyArray<{ nombre: string; prueba: (b: Buffer) => boolean }> = [
  { nombre: "jpeg", prueba: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    nombre: "png",
    prueba: (b) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  },
  {
    nombre: "webp",
    prueba: (b) => b.length > 12 && b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP"
  },
  { nombre: "gif", prueba: (b) => b.length > 6 && b.subarray(0, 4).toString("latin1") === "GIF8" }
];

/** El formato real del archivo según sus primeros bytes, o `null`. */
export function formatoDeImagen(contenido: Buffer): string | null {
  return FIRMAS.find((f) => f.prueba(contenido))?.nombre ?? null;
}

/**
 * Lanza si el archivo no es un mapa de bits conocido.
 *
 * Se llama ANTES de pasárselo a `sharp`, para que un SVG —o cualquier cosa que
 * no sea una foto— no llegue a tocar un decodificador.
 */
export function exigirMapaDeBits(contenido: Buffer, de: string): void {
  if (formatoDeImagen(contenido) === null) {
    throw new Error(`${de}: no es una imagen de mapa de bits (JPEG, PNG, WebP o GIF). Se descarta sin abrirla.`);
  }
}
