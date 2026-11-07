/**
 * Pendientes y cursos por el bot de WhatsApp: qué dice la persona, qué
 * contesta el bot y qué recordatorio le toca según el estatus. Sin Prisma a
 * propósito, para poder probarlo. Quien consulta y escribe es
 * `lib/bot-pendientes.ts`.
 *
 * El circuito, como lo pidió Adrián:
 *
 *   foto       → la evidencia se guarda en el pendiente y pasa a EN PROCESO
 *   «terminé»  → se marca que PIDIÓ CIERRE y se le avisa a gerencia
 *   gerencia   → «sí» lo cierra (COMPLETADO), «no» lo deja en proceso
 *
 * ⚠️ La persona NUNCA cierra su propio pendiente: en los cursos se pide el
 * certificado, y quien lo revisa es gerencia.
 */

export type EstadoPendiente = "PENDIENTE" | "EN_PROCESO" | "COMPLETADO";

/**
 * «Ya terminé», «acabé el curso», «ya lo completé»…
 *
 * ⚠️ El límite de palabra de JavaScript no sabe que «é» es letra: los bordes van a mano.
 */
const TERMINE = /(?<![a-záéíóúüñ])(?:termin[eé]|acab[eé]|finalic[eé]|complet[eé])(?![a-záéíóúüñ])/i;
/** Lo contrario no cuenta: «no terminé», «todavía no acabé». */
const NEGACION = /(?<![a-záéíóúüñ])(?:no|todav[ií]a\s+no|a[uú]n\s+no)\s+(?:he\s+|lo\s+|la\s+)?(?:termin|acab|finaliz|complet)/i;

export function diceQueTermino(texto: string | null | undefined): boolean {
  if (!texto) return false;
  return TERMINE.test(texto) && !NEGACION.test(texto);
}

/** Un número suelto para elegir de una lista: «2», «el 2», «#2». */
export function leerEleccion(texto: string | null | undefined, opciones: number): number | null {
  const m = /^\s*(?:el\s+|la\s+|#|n[uú]mero\s+)?(\d{1,2})\s*[.)]?\s*$/i.exec(texto ?? "");
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= opciones ? n : null;
}

/**
 * La respuesta de gerencia a una petición de cierre: «sí», «si 2», «cerrar»,
 * «no», «no 1». Cualquier otra cosa es plática normal y se la lleva la IA.
 */
export function leerDecision(texto: string | null | undefined): { cerrar: boolean; numero: number | null } | null {
  const m = /^\s*(s[ií]|sip|cerrar|ci[eé]rralo|no|nop)(?![a-záéíóúüñ])[\s,.!#]*(\d{1,2})?\s*[.!]*\s*$/i.exec(texto ?? "");
  if (!m) return null;
  return { cerrar: !/^no/i.test(m[1]), numero: m[2] ? Number(m[2]) : null };
}

export const primerNombre = (nombre: string) => {
  const p = nombre.trim().split(/\s+/)[0] ?? "";
  return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
};

export function listaNumerada(titulos: string[]): string {
  return titulos.map((t, i) => `${i + 1}. ${t}`).join("\n");
}

// ── Lo que contesta el bot ────────────────────────────────────────────────

export function respuestaAvance(titulo: string, cierrePedido: boolean): string {
  if (cierrePedido) return `✅ Guardé tu evidencia de *${titulo}* y se la pasé a gerencia: ellos revisan tu certificado y lo cierran. 🙌`;
  return `✅ Guardé tu avance de *${titulo}* en la app y quedó *en progreso*.\nCuando termines, mándame tu certificado y escríbeme *terminé* 🙌`;
}

export function preguntaCual(motivo: "foto" | "termine", titulos: string[]): string {
  const cabeza = motivo === "foto" ? "📸 ¡Recibido! ¿De cuál pendiente es esta evidencia?" : "🎉 ¡Bien! ¿Cuál terminaste?";
  return `${cabeza}\n${listaNumerada(titulos)}\nRespóndeme solo con el número.`;
}

export function respuestaTermine(titulo: string, tieneEvidencia: boolean): string {
  const base = `🎉 ¡Muy bien! Le avisé a gerencia que terminaste *${titulo}*. Ellos revisan tu certificado y lo marcan como cerrado.`;
  return tieneEvidencia ? base : `${base}\n\nTodavía no me mandas tu certificado: mándamelo aquí en foto 📸`;
}

export function avisoGerenciaCierre(nombre: string, titulo: string, tieneEvidencia: boolean, numero: number | null): string {
  const como = numero ? `*sí ${numero}*` : "*sí*";
  const noComo = numero ? `*no ${numero}*` : "*no*";
  return [
    `📋 ${primerNombre(nombre)} dice que ya terminó *${titulo}*.`,
    tieneEvidencia ? "Arriba va su última evidencia." : "⚠️ Todavía no manda certificado.",
    "",
    `¿Lo marco como terminado? Responde ${como} para cerrarlo o ${noComo} si le falta algo.`
  ].join("\n");
}

export const avisoCerrado = (titulo: string) => `🎉 Gerencia revisó y cerró tu pendiente *${titulo}*. ¡Bien hecho!`;
export const avisoRegresado = (titulo: string) =>
  `Gerencia revisó *${titulo}* y todavía le falta algo, así que sigue *en progreso*. Pregúntales qué falta 🙏`;

export function recordatorioSegunEstado(opciones: { nombre: string; titulo: string; estado: EstadoPendiente; cierrePedido: boolean; vence?: string }): string | null {
  const { titulo } = opciones;
  const nombre = primerNombre(opciones.nombre);
  const vence = opciones.vence ? ` (vence ${opciones.vence})` : "";
  if (opciones.estado === "COMPLETADO" || opciones.cierrePedido) return null;
  if (opciones.estado === "PENDIENTE") {
    return `📚 ${nombre}, todavía no registras avance en *${titulo}*${vence}.\nCuando avances, mándame aquí una foto y lo paso a *en progreso* 📸`;
  }
  return `📚 ${nombre}, ¿cómo vas con *${titulo}*${vence}? 💪\nSi ya terminaste, mándame tu certificado y escríbeme *terminé* para que gerencia lo cierre.`;
}
