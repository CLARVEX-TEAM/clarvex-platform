import { findCounterpart } from "@/lib/inventory-counterparts";

/**
 * La hoja de traspaso del sistema del corporativo, leída de una foto.
 *
 * ⚠️ **Esto es inventario, y la hoja NO trae con qué comprobarse.**
 *
 * Solo llega la primera página --es la que trae el encabezado completo-- así que
 * los renglones que se ven no suman el total: en el traspaso 1767557 se ven 23
 * de 48. No hay una cuenta interna que cierre, como sí la tiene el reporte del
 * POS con su fila «Promedio».
 *
 * Sin nada contra qué contrastar, un `43` leído donde dice `48` entra al kardex
 * y no se nota hasta el conteo físico, semanas después y sin rastro del día.
 *
 * La salida es **leer con DOS modelos distintos y exigir que coincidan**. No es
 * una ocurrencia: medido el 9 de septiembre de 2026 contra cinco reportes reales
 * del POS, Haiku y Sonnet fallaron **una vez cada uno y en sitios distintos**
 * --Haiku en el pie, Sonnet en la venta de una asesora--. Sus erratas son
 * independientes, así que coincidir en el mismo número equivocado es mucho menos
 * probable que equivocarse.
 */

export type Direccion = "SALIDA" | "ENTRADA";

export type HojaTraspaso = {
  /** «Transferir: 1767557». */
  folio: string;
  /** De «Transferencia de salidas» / «de entradas». */
  direccion: Direccion;
  /** «Ubicación de envío: 03029 - …». */
  origen: string | null;
  /** «Ubicación de recepción: 03000 - …». */
  destino: string | null;
  /** «Total unidades enviadas». El del ENCABEZADO, no la suma de renglones. */
  piezas: number;
  /** `YYYY-MM-DD`. */
  fecha: string;
  /** Las cantidades por talla que se alcanzan a ver en ESTA página. */
  renglones: number[];
};

/** Los campos en los que las dos lecturas TIENEN que coincidir. */
const DECISIVOS = ["folio", "direccion", "piezas", "destino", "origen", "fecha"] as const;

const ETIQUETA: Record<(typeof DECISIVOS)[number], string> = {
  folio: "el folio",
  direccion: "si es entrada o salida",
  piezas: "las piezas",
  destino: "la ubicación de recepción",
  origen: "la ubicación de envío",
  fecha: "la fecha"
};

/**
 * ¿Las dos lecturas dicen lo mismo?
 *
 * ⚠️ **Se comparan los campos DECISIVOS, no los renglones.** Un renglón que un
 * modelo ve y el otro no --porque la foto corta la tabla por abajo-- no cambia
 * nada de lo que se guarda; exigir que coincidan rechazaría fotos buenas todo el
 * tiempo y enseñaría a ignorar el aviso.
 */
export function enQueDifieren(a: HojaTraspaso, b: HojaTraspaso): string[] {
  const diferencias: string[] = [];
  for (const campo of DECISIVOS) {
    const uno = a[campo];
    const otro = b[campo];
    // El folio y los códigos se comparan sin ceros ni espacios de adorno: dos
    // lecturas del mismo número no pueden discrepar por el formato.
    const normal = (v: string | number | null) =>
      v === null ? "" : typeof v === "number" ? String(v) : v.trim().toUpperCase();
    if (normal(uno) !== normal(otro)) {
      diferencias.push(`${ETIQUETA[campo]}: una lectura dice «${uno ?? "nada"}» y la otra «${otro ?? "nada"}»`);
    }
  }
  return diferencias;
}

/**
 * Lo que se puede comprobar de una hoja SOLA, sin la segunda lectura.
 *
 * @param tienda El código de la tienda que captura (su APTO). La hoja tiene que
 *   nombrarla en el lado que le toca; si no, no es su traspaso.
 */
export function problemasDeHoja(hoja: HojaTraspaso, tienda: string): string[] {
  const problemas: string[] = [];

  if (!/^\d{4,12}$/.test(hoja.folio.trim())) {
    problemas.push(`el folio «${hoja.folio}» no parece un número de traspaso`);
  }
  if (!Number.isInteger(hoja.piezas) || hoja.piezas <= 0) {
    problemas.push(`las piezas «${hoja.piezas}» no son un entero positivo`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(hoja.fecha)) {
    problemas.push(`la fecha «${hoja.fecha}» no vino completa`);
  }

  /*
   * ⚠️ **La tienda tiene que estar del lado que le toca.**
   *
   * En una SALIDA suya, ella es la ubicación de ENVÍO; en una entrada, la de
   * recepción. Capturar la hoja de otra tienda --o la misma hoja al revés--
   * mueve piezas que nunca pasaron por aquí, y el kardex no tiene forma de
   * enterarse: el descuadre sale en el conteo.
   */
  const suyo = hoja.direccion === "SALIDA" ? hoja.origen : hoja.destino;
  const ajeno = hoja.direccion === "SALIDA" ? hoja.destino : hoja.origen;
  if (!suyo) {
    problemas.push("no se leyó de qué tienda sale la mercancía");
  } else if (!tienda.trim()) {
    /*
     * ⚠️ **Sin APTO no se compara, y no se inventa un problema.**
     *
     * `Store` todavía no guarda el APTO de la tienda, así que llega de fuera y
     * puede no venir. Comparar contra una cadena vacía rechazaría TODAS las
     * hojas con un mensaje absurdo --«la hoja es de la tienda 03029, no de la
     * tuya ()»-- y quien captura buscaría el fallo en el papel. Que la
     * comprobación no se hizo se declara en la respuesta del endpoint.
     */
  } else if (suyo.trim() !== tienda.trim()) {
    problemas.push(
      `la hoja es de la tienda ${suyo}, no de la tuya (${tienda}). Un traspaso ajeno movería piezas que nunca pasaron por aquí`
    );
  }

  if (!ajeno) {
    problemas.push("no se leyó la otra ubicación del traspaso");
  } else if (!findCounterpart(ajeno)) {
    problemas.push(`la contraparte «${ajeno}» no está en el catálogo de destinos`);
  }

  /*
   * ⚠️ Los renglones de UNA página no pueden pasarse del total del encabezado.
   *
   * No demuestra que el total esté bien --normalmente suman menos, porque la
   * hoja sigue-- pero sí caza el caso en que el total se leyó de menos. Es
   * gratis y es la única cuenta que la hoja ofrece por sí sola.
   */
  const suma = hoja.renglones.filter((n) => Number.isFinite(n)).reduce((total, n) => total + n, 0);
  if (suma > hoja.piezas) {
    problemas.push(
      `los renglones visibles suman ${suma} y el encabezado dice ${hoja.piezas}: el total está mal leído`
    );
  }

  return problemas;
}

/** El código de la contraparte, ya resuelto contra el catálogo. */
export function contraparteDe(hoja: HojaTraspaso): { code: string; label: string } | null {
  const ajeno = hoja.direccion === "SALIDA" ? hoja.destino : hoja.origen;
  if (!ajeno) return null;
  const encontrado = findCounterpart(ajeno);
  return encontrado ? { code: encontrado.code, label: encontrado.alias ?? encontrado.name } : null;
}

/**
 * ¿Cerró la cuenta de esta página?
 *
 * Cuando el traspaso cabe en una sola hoja, los renglones SÍ suman el total y
 * eso es una comprobación de verdad. Se dice en la respuesta porque cambia
 * cuánto se puede confiar en el número, y quien captura merece saberlo.
 */
export function cuadraLaPagina(hoja: HojaTraspaso): boolean {
  const suma = hoja.renglones.filter((n) => Number.isFinite(n)).reduce((total, n) => total + n, 0);
  return suma > 0 && suma === hoja.piezas;
}
