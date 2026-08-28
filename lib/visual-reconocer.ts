/**
 * Reconoce a que zona pertenece cada foto del visual, comparandola con las de
 * la semana pasada.
 *
 * Sirve para no tener que ponerle pie a cada foto. Las tomas son siempre las
 * mismas trece zonas de la misma tienda, asi que la del jueves pasado es la
 * mejor referencia posible de como se ve cada sitio.
 *
 * ⚠️ **La mercancia cambia cada semana y es lo que MAS ocupa la foto.** Lo que
 * identifica una zona esta en las orillas y el techo: las señales de
 * evacuacion y hacia donde apuntan, las tiendas vecinas que se ven por el
 * cristal, una columna roja, un arco de madera, un espejo. Por eso esto NO se
 * hace con una huella visual, que pesaria sobre todo la ropa; se hace con un
 * modelo que entiende lo que ve.
 *
 * ⚠️ **Se reparten TODAS a la vez, una por hueco.** Medido contra reportes
 * reales, preguntando foto por foto acierta 10 de 13 y los tres fallos son el
 * mismo: manda una foto de caballero a un hueco de dama que ya estaba ocupado
 * por la suya. Son secciones espejo, con los mismos muebles. Dar la restriccion
 * --trece fotos, trece huecos, una cada uno-- sube a 13 de 13. Esa restriccion
 * es informacion, y sale gratis.
 *
 * Este modulo NO llama a nadie ni toca el disco: arma la peticion y comprueba
 * la respuesta. Lo de fuera va en `visual-reconocer-bedrock.ts` y en la ruta.
 */
import { plano } from "@/lib/visual-pptx";

/** Una foto que llego sin pie: solo sabemos como se llama el archivo. */
export type FotoAnonima = { archivo: string; contenido: Buffer };

/** Una zona conocida, con la foto que se coloco ahi la semana pasada. */
export type Referencia = { etiqueta: string; contenido: Buffer };

export type Asignacion = {
  archivo: string;
  etiqueta: string;
  /** Lo que dijo el modelo. Informativo: no se usa para decidir. */
  seguridad: string;
  porque: string;
};

export type Reparto =
  | { ok: true; asignaciones: Asignacion[] }
  | { ok: false; error: string };

/**
 * ⚠️ Se le dice explicitamente que dama y caballero son espejo.
 *
 * Sin ese aviso, el fallo que se repetia era justo ese. Y se le pide que use el
 * reparto uno a uno para desempatar, que es lo que lo resuelve.
 */
export function construirPrompt(referencias: Referencia[], fotos: FotoAnonima[]): string {
  return `Todas estas fotos son de la MISMA tienda. Las primeras ${referencias.length} son las
zonas conocidas, de una semana anterior, cada una precedida de su nombre.
Despues vienen ${fotos.length} fotos NUEVAS, numeradas.

Tu trabajo: emparejarlas. Cada foto nueva va con UNA zona, y cada zona recibe
UNA sola foto. Es un reparto completo: no sobra ni falta ninguna.

⚠️ La mercancia cambia cada semana y puede haber cambiado la temporada: la ropa
NO sirve para reconocer. Mira lo que no se mueve — arquitectura, muebles,
ventanas y lo que se ve por ellas (tiendas vecinas y sus letreros), señales de
evacuacion y hacia donde apuntan, columnas, espejos, techos. El encuadre y el
zoom varian: la misma zona puede estar mas cerca o mas lejos que la semana
pasada.

⚠️ Cuidado: la seccion de dama (WSW) y la de caballero (MSW) son casi espejo,
con los mismos muebles. Distinguelas por lo que hay ALREDEDOR, no por el mueble.

Como cada zona recibe una sola foto, usa eso: si dudas entre dos, mira cual de
las dos encaja peor en otro sitio.

Responde SOLO con JSON, sin texto alrededor:
{"reparto":[{"foto":1,"zona":"<nombre exacto de la zona>","seguridad":"alta|media|baja","porque":"<que detalle fijo te lo dijo, en 12 palabras>"}]}`;
}

/**
 * Comprueba la respuesta del modelo. **Nada de lo que devuelva se da por bueno.**
 *
 * Un reparto a medias es peor que ninguno: colocaria unas fotos bien y dejaria
 * otras sin sitio sin que se note cual falta. Se exige que sea completo y uno a
 * uno, y si no lo es se dice por que.
 */
export function interpretarReparto(texto: string, fotos: FotoAnonima[], etiquetas: string[]): Reparto {
  let json: unknown;
  try {
    json = JSON.parse(quitarCerca(texto));
  } catch {
    return { ok: false, error: "El lector no devolvio un JSON que se pueda leer." };
  }

  const reparto = (json as { reparto?: unknown }).reparto;
  if (!Array.isArray(reparto)) return { ok: false, error: "La respuesta no trae un reparto." };

  // Por clave normalizada, que es como se comparan las etiquetas en todo el
  // modulo del visual: la plantilla trae espacios dobles.
  const porClave = new Map(etiquetas.map((e) => [plano(e), e]));
  const asignaciones: Asignacion[] = [];
  const fotosVistas = new Set<number>();
  const zonasVistas = new Set<string>();

  for (const fila of reparto) {
    const item = fila as { foto?: unknown; zona?: unknown; seguridad?: unknown; porque?: unknown };
    const indice = typeof item.foto === "number" ? item.foto : Number(item.foto);
    if (!Number.isInteger(indice) || indice < 1 || indice > fotos.length) {
      return { ok: false, error: `Se invento la foto numero ${String(item.foto)}.` };
    }
    if (fotosVistas.has(indice)) {
      return { ok: false, error: `Puso la foto ${indice} en dos zonas.` };
    }

    const zona = typeof item.zona === "string" ? item.zona.trim() : "";
    const clave = plano(zona);
    const etiqueta = porClave.get(clave);
    if (!etiqueta) {
      return { ok: false, error: `«${zona || "(vacio)"}» no es ninguna de las zonas de la plantilla.` };
    }
    if (zonasVistas.has(clave)) {
      return { ok: false, error: `Puso dos fotos en «${etiqueta}».` };
    }

    fotosVistas.add(indice);
    zonasVistas.add(clave);
    asignaciones.push({
      archivo: fotos[indice - 1].archivo,
      etiqueta,
      seguridad: typeof item.seguridad === "string" ? item.seguridad : "",
      porque: typeof item.porque === "string" ? item.porque : ""
    });
  }

  if (asignaciones.length !== fotos.length) {
    const faltan = fotos.filter((_, i) => !fotosVistas.has(i + 1)).map((f) => f.archivo);
    return { ok: false, error: `Dejo ${faltan.length} foto(s) sin zona: ${faltan.join(", ")}.` };
  }

  // En el orden en que llegaron las fotos, no en el que contesto el modelo.
  const porArchivo = new Map(asignaciones.map((a) => [a.archivo, a]));
  return { ok: true, asignaciones: fotos.map((f) => porArchivo.get(f.archivo)!) };
}

/**
 * Cambia una foto de zona, **intercambiando** con quien la tuviera.
 *
 * No basta con reasignar: dejaria dos fotos en la misma zona y otra sin
 * ninguna, que es justo lo que el reparto uno a uno evita. Si la zona estaba
 * libre --no puede pasar en un reparto completo, pero si tras varios cambios--
 * simplemente se mueve.
 */
export function cambiarZona(asignaciones: Asignacion[], archivo: string, etiqueta: string, etiquetas: string[]): Reparto {
  const destino = etiquetas.find((e) => plano(e) === plano(etiqueta));
  if (!destino) return { ok: false, error: `«${etiqueta}» no es ninguna de las zonas de la plantilla.` };

  const mia = asignaciones.find((a) => a.archivo === archivo);
  if (!mia) return { ok: false, error: `No hay ninguna foto «${archivo}» en la propuesta.` };
  if (plano(mia.etiqueta) === plano(destino)) return { ok: true, asignaciones };

  const suya = asignaciones.find((a) => plano(a.etiqueta) === plano(destino));
  const antes = mia.etiqueta;

  return {
    ok: true,
    asignaciones: asignaciones.map((a) => {
      if (a.archivo === archivo) return { ...a, etiqueta: destino, seguridad: "corregida", porque: "lo dijiste tu" };
      if (suya && a.archivo === suya.archivo) return { ...a, etiqueta: antes, seguridad: "intercambiada", porque: `cedio «${destino}»` };
      return a;
    })
  };
}

/** El nombre con el que el bot guarda una foto que llego sin pie. */
export const SIN_NOMBRE = "sin-nombre-";

export function esSinNombre(archivo: string): boolean {
  return archivo.toLowerCase().startsWith(SIN_NOMBRE);
}

function quitarCerca(texto: string): string {
  const limpio = texto.trim();
  if (!limpio.startsWith("```")) return limpio;
  return limpio.replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
}
