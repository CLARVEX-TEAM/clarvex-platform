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
  | { tipo: "codigo"; texto: string };

export type Bloque =
  | { tipo: "parrafo"; trozos: Trozo[] }
  | { tipo: "cita"; trozos: Trozo[] }
  | { tipo: "vineta"; trozos: Trozo[] }
  | { tipo: "numero"; indice: number; trozos: Trozo[] }
  | { tipo: "codigo"; texto: string };

/** Marcas de una línea, en orden de prioridad. */
const MARCAS: Array<{ tipo: Trozo["tipo"]; signo: string }> = [
  // El código va PRIMERO: dentro de `así` no se interpreta nada más, que es
  // justo para lo que sirve.
  { tipo: "codigo", signo: "`" },
  { tipo: "negrita", signo: "*" },
  { tipo: "tachado", signo: "~" },
  { tipo: "cursiva", signo: "_" }
];

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

    if (marca) {
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
