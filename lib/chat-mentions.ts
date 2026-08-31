/**
 * Menciones `@` en el chat.
 *
 * Para qué: en un grupo de cinco personas, hoy avisas a todos o a nadie. Un
 * «@Waira revisa el marbete 12» le llega a ella y el resto lo lee sin que le
 * suene el teléfono.
 *
 * ⚠️ Aquí no hay Prisma ni red: solo decidir a quién se menciona. Es lo que hay
 * que poder probar, porque de ello depende a quién se le avisa.
 */

export type MencionableUser = { userId: string; name: string };

export type Mencion = {
  userId: string;
  /** El texto tal cual se escribió, para poder resaltarlo sin adivinar. */
  escrito: string;
  desde: number;
  hasta: number;
};

/** `@todos` avisa a la sala entera. */
export const TODOS = "todos";

const plano = (texto: string) =>
  texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/**
 * El nombre corto con el que se menciona a alguien: su primer nombre.
 *
 * ⚠️ Si dos personas comparten primer nombre, **ninguna de las dos** se puede
 * mencionar solo con él. Es la misma regla que el lector del POS: elegir mal
 * avisaría a quien no era, y en un chat de trabajo eso es peor que no avisar.
 * A esas se las menciona con nombre y apellido.
 */
export function nombresMencionables(gente: MencionableUser[]): Map<string, string> {
  const porClave = new Map<string, string[]>();

  const registrar = (clave: string, userId: string) => {
    if (!clave) return;
    porClave.set(clave, [...(porClave.get(clave) ?? []), userId]);
  };

  for (const persona of gente) {
    const partes = plano(persona.name).split(/\s+/).filter(Boolean);
    if (partes.length === 0) continue;
    registrar(partes[0], persona.userId);
    if (partes.length > 1) registrar(`${partes[0]} ${partes[1]}`, persona.userId);
  }

  // Solo se queda lo que identifica a UNA persona.
  const unicos = new Map<string, string>();
  for (const [clave, ids] of porClave) {
    const distintos = [...new Set(ids)];
    if (distintos.length === 1) unicos.set(clave, distintos[0]);
  }
  return unicos;
}

/**
 * Encuentra las menciones de un mensaje.
 *
 * Se prueba primero con dos palabras y luego con una, para que «@Ana Sofía»
 * gane sobre «@Ana» cuando ambas existan.
 */
export function encontrarMenciones(body: string, gente: MencionableUser[]): Mencion[] {
  const nombres = nombresMencionables(gente);
  const mencion = /@([\p{L}\p{M}]+(?:\s+[\p{L}\p{M}]+)?)/gu;
  const encontradas: Mencion[] = [];
  const yaVistos = new Set<string>();

  for (const m of body.matchAll(mencion)) {
    const desde = m.index ?? 0;
    const bruto = m[1];
    const partes = bruto.split(/\s+/);

    for (const intento of partes.length > 1 ? [bruto, partes[0]] : [partes[0]]) {
      const clave = plano(intento);
      const userId = clave === TODOS ? TODOS : nombres.get(clave);
      if (!userId) continue;
      const escrito = `@${intento}`;
      if (!yaVistos.has(userId)) {
        encontradas.push({ userId, escrito, desde, hasta: desde + escrito.length });
        yaVistos.add(userId);
      }
      break;
    }
  }
  return encontradas;
}

/**
 * A quién hay que avisar por un mensaje.
 *
 * ⚠️ **Nunca a quien lo escribe.** Mencionarse a uno mismo pasa al releer lo que
 * escribiste, y recibir un aviso de tu propio mensaje solo enseña a ignorarlos.
 */
export function aQuienAvisar(
  body: string,
  gente: MencionableUser[],
  autorId: string,
  miembros: string[]
): { userIds: string[]; aTodos: boolean } {
  const menciones = encontrarMenciones(body, gente);
  const aTodos = menciones.some((m) => m.userId === TODOS);
  if (aTodos) return { userIds: miembros.filter((id) => id !== autorId), aTodos: true };

  const userIds = menciones
    .map((m) => m.userId)
    .filter((id) => id !== autorId && miembros.includes(id));
  return { userIds: [...new Set(userIds)], aTodos: false };
}
