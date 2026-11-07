/**
 * Matrices de cursos (pendientes de tipo CURSO): emparejar lo que dice un
 * certificado con los cursos de la matriz y redactar el avance. Sin Prisma a
 * propósito, para poder probarlo.
 */

export type CursoMatriz = { id: string; orden: number; nombre: string; completadoAt: Date | null };

/** Minúsculas, sin acentos ni signos: «POS Xstore Admin» = «pos xstore admin». */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * ¿De qué curso de la matriz es el certificado?
 *
 * ⚠️ Gana el nombre MÁS LARGO que encaje: «POS Xstore Admin» contiene a
 * «POS Xstore», y un certificado del primero no puede completar el segundo.
 */
export function cursoDelCertificado<T extends { nombre: string }>(leido: string | null | undefined, cursos: T[]): T | null {
  if (!leido) return null;
  const l = normalizar(leido);
  if (!l) return null;
  const exacto = cursos.find((c) => normalizar(c.nombre) === l);
  if (exacto) return exacto;
  const candidatos = cursos
    .filter((c) => {
      const n = normalizar(c.nombre);
      return n.length > 0 && (` ${l} `.includes(` ${n} `) || ` ${n} `.includes(` ${l} `));
    })
    .sort((a, b) => normalizar(b.nombre).length - normalizar(a.nombre).length);
  return candidatos[0] ?? null;
}

/**
 * ¿El certificado es de esta persona? Basta con que coincidan dos palabras del
 * nombre --el certificado trae el nombre completo («EDUARDO ALONSO TREVIÑO
 * VAZQUEZ») y la app a veces solo dos («ALONSO TREVIÑO»)--, o la única si en la
 * app solo hay una.
 */
export function esDeLaPersona(nombreCertificado: string | null | undefined, nombrePersona: string): boolean {
  if (!nombreCertificado) return false;
  const cert = new Set(normalizar(nombreCertificado).split(" ").filter((p) => p.length > 1));
  const propias = normalizar(nombrePersona).split(" ").filter((p) => p.length > 1);
  const comunes = propias.filter((p) => cert.has(p)).length;
  return comunes >= Math.min(2, propias.length);
}

export function avanceDeMatriz(cursos: CursoMatriz[]): { hechos: number; total: number; faltan: string[] } {
  const ordenados = [...cursos].sort((a, b) => a.orden - b.orden);
  return {
    hechos: ordenados.filter((c) => c.completadoAt).length,
    total: ordenados.length,
    faltan: ordenados.filter((c) => !c.completadoAt).map((c) => c.nombre)
  };
}

export function textoAvance(matriz: string, cursos: CursoMatriz[]): string {
  const { hechos, total, faltan } = avanceDeMatriz(cursos);
  if (faltan.length === 0) return `Completaste los ${total} cursos de *${matriz}* 🎉`;
  return `Llevas *${hechos} de ${total}* cursos de *${matriz}*. Te faltan: ${faltan.join(", ")}.`;
}
