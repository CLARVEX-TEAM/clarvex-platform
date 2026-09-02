/**
 * Formato del chat: negrita, cursiva, tachado, código, cita y listas.
 *
 * ⚠️ **Se guarda TEXTO, no HTML.** El cuerpo del mensaje sigue siendo una
 * cadena con marcas —`*así*`— y se convierte a elementos al pintarlo. Guardar
 * HTML en un chat donde escriben doce personas es abrir la puerta a que un
 * mensaje ejecute código en la pantalla de los demás, y no hay forma de
 * cerrarla después sin reescribir el historial.
 *
 * ⚠️ **Las marcas son las de Slack, no las de Markdown**, y es deliberado:
 * `*negrita*` y no `**negrita**`. El chat se refleja en Slack tal cual
 * (`publicarEnSlackSinEsperar` manda el cuerpo sin tocar), así que usando su
 * sintaxis el mensaje se ve bien en los dos lados sin traducir nada. Con
 * Markdown habría que convertir en cada envío, y lo que no se convierta se ve
 * con los asteriscos a la vista.
 */

export type Trozo =
  | { tipo: "texto"; texto: string }
  | { tipo: "negrita"; texto: string }
  | { tipo: "cursiva"; texto: string }
  | { tipo: "tachado"; texto: string }
  | { tipo: "codigo"; texto: string }
  /** `texto` es lo que se ve; `url` a dónde va. Pueden ser distintos. */
  | { tipo: "enlace"; texto: string; url: string };

export type Bloque =
  | { tipo: "parrafo"; trozos: Trozo[] }
  | { tipo: "cita"; trozos: Trozo[] }
  | { tipo: "vineta"; trozos: Trozo[] }
  | { tipo: "numero"; indice: number; trozos: Trozo[] }
  | { tipo: "codigo"; texto: string };

/**
 * Marcas de una línea, en orden de prioridad.
 *
 * El tipo se acota a los cuatro que se abren y cierran con un signo. Los otros
 * dos trozos no caben aquí: `texto` no tiene marca, y `enlace` lleva además un
 * destino, así que construirlo desde esta lista dejaría un enlace sin `url`.
 */
type TipoMarca = "negrita" | "cursiva" | "tachado" | "codigo";

const MARCAS: Array<{ tipo: TipoMarca; signo: string }> = [
  // El código va PRIMERO: dentro de `así` no se interpreta nada más, que es
  // justo para lo que sirve.
  { tipo: "codigo", signo: "`" },
  { tipo: "negrita", signo: "*" },
  { tipo: "tachado", signo: "~" },
  { tipo: "cursiva", signo: "_" }
];

/**
 * Enlace con etiqueta: `<https://…|el texto que se ve>`.
 *
 * Es la sintaxis de Slack, como el resto de marcas, y por eso el mismo cuerpo
 * se ve bien en los dos lados sin traducir nada: el espejo manda el texto tal
 * cual y Slack lo pinta igual.
 */
const ENLACE_CON_ETIQUETA = /^<(https?:\/\/[^<>|\s]+)(?:\|([^<>]*))?>/;

/** Enlace pegado a secas, sin envolver en nada. */
const ENLACE_DESNUDO = /^https?:\/\/[^\s<>]+/;

/**
 * Lee un enlace que empiece justo en `desde`, o devuelve null.
 *
 * ⚠️ **Solo `http` y `https`, y no por si acaso.** Un `javascript:` o un
 * `data:` metidos en un `href` ejecutan código en la pantalla de quien lo
 * pulse, y aquí el cuerpo lo escriben doce personas. La única puerta es esta
 * función: si el esquema no está en la expresión regular, no hay enlace y el
 * texto se queda como texto.
 */
function leerEnlace(linea: string, desde: number): { trozo: Trozo; hasta: number } | null {
  const resto = linea.slice(desde);

  const conEtiqueta = ENLACE_CON_ETIQUETA.exec(resto);
  if (conEtiqueta) {
    const url = conEtiqueta[1] ?? "";
    const rotulo = (conEtiqueta[2] ?? "").trim();
    return {
      trozo: { tipo: "enlace", texto: rotulo || url, url },
      hasta: desde + conEtiqueta[0].length
    };
  }

  const desnudo = ENLACE_DESNUDO.exec(resto);
  if (desnudo) {
    /*
     * La puntuación final NO es del enlace. «Míralo en https://clarvex.tech.»
     * acaba en punto, y meterlo dentro da una dirección que no existe. El
     * paréntesis solo se quita si no se abrió dentro —hay URLs que los llevan—.
     */
    let url = desnudo[0];
    while (url.length > 0) {
      const ultimo = url[url.length - 1] ?? "";
      const sobra =
        ".,;:!?".includes(ultimo) || (ultimo === ")" && !url.slice(0, -1).includes("("));
      if (!sobra) break;
      url = url.slice(0, -1);
    }
    if (!url) return null;
    return { trozo: { tipo: "enlace", texto: url, url }, hasta: desde + url.length };
  }

  return null;
}

/**
 * Parte una línea en trozos con formato.
 *
 * Se hace a mano y no con una expresión regular grande porque el anidado y los
 * signos sueltos son la mitad del problema: un `*` solo en «2*3» no debe
 * empezar una negrita que nunca cierra.
 */
export function trozos(linea: string): Trozo[] {
  const salida: Trozo[] = [];
  let plano = "";

  const soltarPlano = () => {
    if (plano) {
      salida.push({ tipo: "texto", texto: plano });
      plano = "";
    }
  };

  let i = 0;
  while (i < linea.length) {
    const marca = MARCAS.find((m) => linea.startsWith(m.signo, i));

    /*
     * El código va primero y se come su tramo entero: dentro de `así` no se
     * interpreta nada, ni siquiera un enlace. Es justo para lo que sirve —
     * poder enseñar una dirección sin que se vuelva pulsable.
     */
    if (marca?.tipo === "codigo") {
      const cierre = linea.indexOf(marca.signo, i + marca.signo.length);
      const contenido = cierre === -1 ? "" : linea.slice(i + marca.signo.length, cierre);
      if (cierre !== -1 && contenido.length > 0) {
        soltarPlano();
        salida.push({ tipo: "codigo", texto: contenido });
        i = cierre + marca.signo.length;
        continue;
      }
    }

    // Los enlaces, antes que negrita/cursiva/tachado: una URL trae guiones
    // bajos y asteriscos con toda normalidad, y si se miran primero como
    // marcas se parte por la mitad y deja de funcionar.
    const enlace = leerEnlace(linea, i);
    if (enlace) {
      soltarPlano();
      salida.push(enlace.trozo);
      i = enlace.hasta;
      continue;
    }

    if (marca && marca.tipo !== "codigo") {
      const cierre = linea.indexOf(marca.signo, i + marca.signo.length);
      const contenido = cierre === -1 ? "" : linea.slice(i + marca.signo.length, cierre);

      /*
       * Solo cuenta si cierra Y tiene algo dentro. Un signo suelto —«2*3»— o
       * un `**` vacío se quedan como texto: interpretarlos se comería
       * caracteres que la persona quiso escribir.
       */
      if (cierre !== -1 && contenido.length > 0) {
        soltarPlano();
        salida.push({ tipo: marca.tipo, texto: contenido });
        i = cierre + marca.signo.length;
        continue;
      }
    }

    plano += linea[i];
    i += 1;
  }

  soltarPlano();
  return salida;
}

/**
 * Convierte el cuerpo del mensaje en bloques.
 *
 * Se trabaja por líneas porque cita, viñeta y numerada son de línea entera;
 * mezclar eso con el formato de dentro en un solo paso hace que un `-` a mitad
 * de frase abra una lista.
 */
export function bloques(cuerpo: string): Bloque[] {
  const lineas = cuerpo.split("\n");
  const salida: Bloque[] = [];

  let enCodigo = false;
  let acumuladoCodigo: string[] = [];
  let contadorNumero = 0;

  for (const linea of lineas) {
    // Bloque de código con ```
    if (linea.trim() === "```") {
      if (enCodigo) {
        salida.push({ tipo: "codigo", texto: acumuladoCodigo.join("\n") });
        acumuladoCodigo = [];
      }
      enCodigo = !enCodigo;
      continue;
    }
    if (enCodigo) {
      acumuladoCodigo.push(linea);
      continue;
    }

    const cita = /^>\s?(.*)$/.exec(linea);
    if (cita) {
      contadorNumero = 0;
      salida.push({ tipo: "cita", trozos: trozos(cita[1] ?? "") });
      continue;
    }

    const vineta = /^[-•]\s+(.*)$/.exec(linea);
    if (vineta) {
      contadorNumero = 0;
      salida.push({ tipo: "vineta", trozos: trozos(vineta[1] ?? "") });
      continue;
    }

    const numero = /^\d+[.)]\s+(.*)$/.exec(linea);
    if (numero) {
      /*
       * Se renumera desde 1 en vez de respetar lo tecleado. Alguien que pega
       * una lista que empieza en 3 —o que escribe «1.» tres veces— espera
       * verla ordenada, no repetida.
       */
      contadorNumero += 1;
      salida.push({ tipo: "numero", indice: contadorNumero, trozos: trozos(numero[1] ?? "") });
      continue;
    }

    contadorNumero = 0;
    salida.push({ tipo: "parrafo", trozos: trozos(linea) });
  }

  // Un bloque de código sin cerrar no se pierde: se cierra solo al final.
  if (enCodigo && acumuladoCodigo.length > 0) {
    salida.push({ tipo: "codigo", texto: acumuladoCodigo.join("\n") });
  }

  return salida;
}

/**
 * Envuelve la selección con una marca, o la quita si ya la tenía.
 *
 * Devuelve el texto nuevo y dónde dejar el cursor. Sin lo segundo, el cursor
 * salta al final después de cada botón y hay que volver a colocarlo a mano.
 */
export function alternarMarca(
  texto: string,
  desde: number,
  hasta: number,
  signo: string
): { texto: string; desde: number; hasta: number } {
  const antes = texto.slice(0, desde);
  const dentro = texto.slice(desde, hasta);
  const despues = texto.slice(hasta);

  // Ya estaba marcado: se quita.
  if (antes.endsWith(signo) && despues.startsWith(signo)) {
    return {
      texto: antes.slice(0, -signo.length) + dentro + despues.slice(signo.length),
      desde: desde - signo.length,
      hasta: hasta - signo.length
    };
  }

  // Sin selección se dejan las dos marcas y el cursor en medio, para escribir
  // dentro. Es lo que hace cualquier editor y lo que la mano espera.
  if (dentro.length === 0) {
    return {
      texto: `${antes}${signo}${signo}${despues}`,
      desde: desde + signo.length,
      hasta: desde + signo.length
    };
  }

  return {
    texto: `${antes}${signo}${dentro}${signo}${despues}`,
    desde: desde + signo.length,
    hasta: hasta + signo.length
  };
}

/** Marca cada línea seleccionada con un prefijo (cita, viñeta). */
export function alternarPrefijo(texto: string, desde: number, hasta: number, prefijo: string): string {
  const inicioLinea = texto.lastIndexOf("\n", desde - 1) + 1;
  const finLineaCrudo = texto.indexOf("\n", hasta);
  const finLinea = finLineaCrudo === -1 ? texto.length : finLineaCrudo;

  const bloque = texto.slice(inicioLinea, finLinea);
  const lineas = bloque.split("\n");
  const todasMarcadas = lineas.every((l) => l.startsWith(prefijo));

  const nuevas = lineas.map((l) => (todasMarcadas ? l.slice(prefijo.length) : prefijo + l));
  return texto.slice(0, inicioLinea) + nuevas.join("\n") + texto.slice(finLinea);
}

/**
 * El mensaje en texto llano, para la vista previa de la lista.
 *
 * Quita las marcas de formato y aplana los saltos de línea. En una fila de
 * una sola línea, `*Hola*` con asteriscos se lee peor que sin ellos, y un
 * mensaje con cita y viñetas se convierte en un amasijo de `>` y `-`.
 */
export function textoLlano(cuerpo: string): string {
  return bloques(cuerpo)
    .map((b) => {
      if (b.tipo === "codigo") return b.texto;
      return b.trozos.map((t) => t.texto).join("");
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
