/**
 * El paquete de fotos de entrada para el Forms de AXO, en el ORDEN del Forms:
 * gerente, subgerente y luego asesor 1, 2, 3… Sin Prisma a propósito, para
 * poder probarlo; quien consulta y manda es el cron de asistencia AXO.
 *
 * ⚠️ El número de asesor sale del MISMO orden que la tarjeta de `/checklist`
 * (puesto, hora de entrada, nombre). Si cambia uno y no el otro, «Asesor 2» en
 * WhatsApp y en la tarjeta serían personas distintas.
 */

export type PersonaDelDia = { userId: string; name: string; role: string; expectedAt: string };
export type FotoDelDia = { userId: string; hora: string; url: string; mimeType: string };

export type LugarEnForms = { userId: string; etiqueta: string; nombre: string; foto: FotoDelDia | null };

const ORDEN: Record<string, number> = { GERENTE: 0, SUBGERENTE: 1, ASESOR: 2 };

export function ordenDelForms(personas: PersonaDelDia[], fotos: FotoDelDia[]): LugarEnForms[] {
  const fotoDe = new Map(fotos.map((f) => [f.userId, f]));
  let asesor = 0;
  return [...personas]
    .sort((a, b) => (ORDEN[a.role] ?? 3) - (ORDEN[b.role] ?? 3) || a.expectedAt.localeCompare(b.expectedAt) || a.name.localeCompare(b.name, "es"))
    .map((p) => {
      const etiqueta = p.role === "GERENTE" ? "Gerente" : p.role === "SUBGERENTE" ? "Subgerente" : `Asesor ${++asesor}`;
      return { userId: p.userId, etiqueta, nombre: primerNombre(p.name), foto: fotoDe.get(p.userId) ?? null };
    });
}

function primerNombre(nombre: string): string {
  const p = nombre.trim().split(/\s+/)[0] ?? "";
  return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
}

/** El mensaje de arriba: quién ya mandó su foto y quién falta. */
export function resumenParaForms(lugares: LugarEnForms[]): string {
  const renglones = lugares.map((l) => `${l.foto ? "✅" : "⏳"} ${l.etiqueta} — ${l.nombre}${l.foto ? ` (${l.foto.hora})` : ""}`);
  const faltan = lugares.filter((l) => !l.foto).map((l) => l.nombre);
  return [
    "📸 *Fotos de entrada para el Forms de AXO*",
    "Van abajo, en el orden del Forms:",
    "",
    ...renglones,
    "",
    faltan.length ? `⚠️ Falta foto de: *${faltan.join(", ")}*. Pídansela por aquí al bot.` : "✅ Ya están todas."
  ].join("\n");
}
