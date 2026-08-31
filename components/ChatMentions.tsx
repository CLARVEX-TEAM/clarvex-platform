"use client";

import { cn } from "@/lib/utils";
import { encontrarMenciones, type MencionableUser } from "@/lib/chat-mentions";

/**
 * Pinta el texto de un mensaje resaltando las menciones.
 *
 * ⚠️ Se usa **el mismo `encontrarMenciones` que el servidor**, no una regex
 * propia. Con dos reglas distintas la pantalla acabaría resaltando a alguien a
 * quien no se avisó, o al revés — y el resaltado dejaría de significar nada.
 */
export function MentionText({
  body,
  gente,
  yo,
  claro
}: {
  body: string;
  gente: MencionableUser[];
  yo: string;
  claro?: boolean;
}) {
  const menciones = encontrarMenciones(body, gente);
  if (menciones.length === 0) return <>{body}</>;

  const trozos: React.ReactNode[] = [];
  let cursor = 0;

  menciones
    .slice()
    .sort((a, b) => a.desde - b.desde)
    .forEach((m, i) => {
      if (m.desde > cursor) trozos.push(body.slice(cursor, m.desde));
      // A ti te resalta más fuerte: es la diferencia entre «me hablan» y «hablan».
      const esMio = m.userId === yo || m.userId === "todos";
      trozos.push(
        <span
          key={`${m.userId}-${i}`}
          className={cn(
            "rounded px-1 font-semibold",
            esMio
              ? claro
                ? "bg-white/25 text-white"
                : "bg-amber-100 text-amber-900 dark:bg-amber-400/25 dark:text-amber-200"
              : claro
                ? "text-white/90 underline decoration-white/40"
                : "text-brand"
          )}
        >
          {m.escrito}
        </span>
      );
      cursor = m.hasta;
    });

  if (cursor < body.length) trozos.push(body.slice(cursor));
  return <>{trozos}</>;
}

export type SugerenciaMencion = { userId: string; name: string; photoUrl: string | null };

/**
 * Lo que hay que sugerir mientras se escribe una mención.
 *
 * Devuelve `null` si el cursor no está dentro de un `@…`, para que la lista no
 * aparezca de la nada mientras se escribe cualquier otra cosa.
 */
export function mencionEnCurso(texto: string, cursor: number): { desde: number; termino: string } | null {
  const antes = texto.slice(0, cursor);
  const arroba = antes.lastIndexOf("@");
  if (arroba === -1) return null;

  // Tiene que ir pegada al principio o a un espacio: «correo@dominio» no cuenta.
  const previo = arroba === 0 ? " " : antes[arroba - 1];
  if (!/\s/.test(previo)) return null;

  const termino = antes.slice(arroba + 1);
  if (termino.includes("\n")) return null;

  /*
   * ⚠️ Una mención son como mucho DOS palabras: nombre y apellido.
   *
   * Sin este corte, «@waira ya cerré la tienda» seguía contando como mención en
   * curso y la lista se quedaba abierta el resto de la frase, tapando el chat.
   * Con la palabra escrita y un espacio detrás todavía se sugiere, porque puede
   * venir el apellido.
   */
  if (termino.split(/\s+/).length > 2) return null;
  return { desde: arroba, termino };
}

export function filtrarSugerencias(gente: SugerenciaMencion[], termino: string, yo: string): SugerenciaMencion[] {
  const plano = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const q = plano(termino.trim());
  // Sin nada escrito se ofrecen todos; con algo, los que empiezan por ahí.
  return gente
    .filter((p) => p.userId !== yo)
    .filter((p) => q === "" || plano(p.name).split(/\s+/).some((parte) => parte.startsWith(q)))
    .slice(0, 6);
}
