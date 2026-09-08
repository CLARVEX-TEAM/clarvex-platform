/**
 * Convierte una promoción del corporativo en el texto de un comunicado.
 *
 * ⚠️ **El modelo EXTRAE; aquí se REDACTA con plantilla fija.** Es la decisión
 * de fondo de toda esta función. Un modelo que redacta reescribe, y una
 * restricción reescrita es una restricción CAMBIADA: «no aplica en LICENCIAS
 * (RELOJES Y FRAGANCIAS)» resumido como «aplican restricciones» es vender a un
 * precio que no era, en el mostrador y sin que nadie lo note hasta el corte.
 *
 * Así que lo que el modelo devuelve son campos, y de ahí sale el texto por
 * concatenación. Lo único redactado es el saludo.
 */

export type PromoExtraida = {
  /** Cómo la llama el corporativo: «Tommy Hours», «CAPAS BASE SEPTIEMBRE». */
  promocion: string;
  /** Tal cual viene: «Del 01 al 10 de septiembre 2026». */
  vigencia: string;
  /** Cada línea de descuento, literal: «40% SPRING 2026». */
  descuentos: string[];
  /** El número que acompaña a la promoción, si viene. */
  codigo: string | null;
  /** Mercancía que NO participa, literal. */
  noParticipa: string[];
  /**
   * Lo que no es descuento ni exclusión y aun así hay que obedecer.
   *
   * ⚠️ **Este campo existe por un caso real.** Un correo terminaba con
   * «Recuerden que a partir de mañana NO puede hacerse venta producto del 60%
   * bajo esa promoción»: una orden operativa, subrayada, que un extractor
   * pensado solo para promoción/vigencia/restricciones tira a la basura. Es
   * justo la línea que más caro sale perder.
   */
  avisos: string[];
};

export type Comunicado = { title: string; body: string };

/**
 * ⚠️ **El correo trae DOS archivos de restricciones y solo uno es nuestro.**
 * `Restricciones TH 40.docx` es Tommy Hilfiger --la tienda-- y
 * `Restricciones TJ 40.docx` es Tommy Jeans. Llegan juntos, en el mismo correo,
 * con nombres que se diferencian en una letra.
 *
 * Sacar las restricciones del archivo equivocado es aplicar las condiciones de
 * otra marca: se descuenta lo que no se podía y se niega lo que sí. Por eso
 * esto se PARA en vez de elegir por parecido.
 */
export function esRestriccionDeLaTienda(nombreArchivo: string): { vale: boolean; porque: string } {
  const limpio = nombreArchivo.trim().toUpperCase();
  // Se busca la marca como palabra suelta: «TH» dentro de «MONTH» no cuenta.
  const th = /\bTH\b/.test(limpio);
  const tj = /\bTJ\b/.test(limpio);

  if (th && tj) return { vale: false, porque: "el nombre menciona TH y TJ a la vez; no se puede saber cuál es" };
  if (tj) return { vale: false, porque: "es de Tommy Jeans (TJ), no de esta tienda" };
  if (th) return { vale: true, porque: "Tommy Hilfiger" };
  return { vale: false, porque: "el nombre no dice si es TH o TJ" };
}

/** Una lista en viñetas, o nada si está vacía. */
function vinetas(titulo: string, lineas: string[]): string {
  const limpias = lineas.map((l) => l.trim()).filter(Boolean);
  if (limpias.length === 0) return "";
  return `${titulo}\n${limpias.map((l) => `• ${l}`).join("\n")}`;
}

/**
 * Arma el comunicado.
 *
 * ⚠️ **Nada de lo extraído se reescribe ni se abrevia**: descuentos,
 * exclusiones y avisos van tal cual llegaron. Lo que se añade son los
 * encabezados, que son nuestros y no cambian el sentido de nada.
 */
export function redactarComunicado(promo: PromoExtraida): Comunicado {
  const partes: string[] = [];

  partes.push(`Vigencia: ${promo.vigencia.trim()}`);

  const descuentos = vinetas("Descuentos:", promo.descuentos);
  if (descuentos) partes.push(descuentos);

  if (promo.codigo?.trim()) partes.push(`Código: ${promo.codigo.trim()}`);

  const excluida = vinetas("Mercancía que NO participa:", promo.noParticipa);
  if (excluida) partes.push(excluida);

  // ⚠️ Los avisos van al FINAL y con marca. Son órdenes, no información: si se
  // mezclan entre los descuentos se leen por encima y se pierden.
  const avisos = vinetas("⚠️ Importante:", promo.avisos);
  if (avisos) partes.push(avisos);

  return {
    title: promo.promocion.trim(),
    body: partes.join("\n\n")
  };
}

/**
 * ¿Se puede publicar esto, o falta algo que lo haría engañoso?
 *
 * ⚠️ **Un comunicado a medias es peor que ninguno.** Sin vigencia, la promoción
 * parece indefinida; sin descuentos, no dice nada. Es preferible avisar de que
 * la lectura salió incompleta y que la persona mire el correo, a publicar algo
 * que se lee como completo y no lo está.
 */
export function faltaAlgo(promo: PromoExtraida): string[] {
  const faltas: string[] = [];
  if (!promo.promocion?.trim()) faltas.push("el nombre de la promoción");
  if (!promo.vigencia?.trim()) faltas.push("la vigencia");
  if (promo.descuentos.filter((d) => d.trim()).length === 0) faltas.push("los descuentos");
  return faltas;
}
