"use client";

/**
 * Pinta el cuerpo de un mensaje con su formato, y enseña quién lo vio.
 *
 * El texto llega con marcas —`*así*`— y se convierte a elementos aquí. **Nunca
 * se inyecta HTML**: `dangerouslySetInnerHTML` en un chat donde escriben doce
 * personas es abrir la puerta a que un mensaje ejecute código en la pantalla
 * de los demás.
 */

import { useMemo } from "react";
import { Check } from "lucide-react";
import { bloques, type Trozo } from "@/lib/chat-formato";
import { MentionText } from "@/components/ChatMentions";
import { cn } from "@/lib/utils";

function Trozos({
  lista,
  gente,
  yo,
  claro
}: {
  lista: Trozo[];
  gente: { userId: string; name: string }[];
  yo: string;
  claro: boolean;
}) {
  return (
    <>
      {lista.map((t, i) => {
        // Las menciones se resuelven dentro del texto plano, para que
        // `*@Waira*` siga avisando a Waira.
        const contenido = <MentionText body={t.texto} gente={gente} yo={yo} claro={claro} />;

        /*
         * ⚠️ `rel="noopener noreferrer"` no es adorno. Sin `noopener`, la
         * página que se abre puede reescribir la nuestra desde `window.opener`
         * —y aquí quien pone el enlace es cualquiera del equipo—.
         *
         * El destino ya viene filtrado a http/https desde `leerEnlace`; esto
         * cubre lo otro. La etiqueta va como TEXTO, nunca como HTML: el `href`
         * es lo único que el mensaje decide.
         */
        if (t.tipo === "enlace") {
          return (
            <a
              key={i}
              href={t.url}
              target="_blank"
              rel="noopener noreferrer"
              title={t.url}
              className={cn(
                "underline underline-offset-2 break-all",
                claro ? "text-blue-700 hover:text-blue-900" : "text-blue-300 hover:text-blue-200"
              )}
            >
              {t.texto}
            </a>
          );
        }

        if (t.tipo === "negrita") return <strong key={i} className="font-bold">{contenido}</strong>;
        if (t.tipo === "cursiva") return <em key={i} className="italic">{contenido}</em>;
        if (t.tipo === "tachado") return <s key={i} className="line-through opacity-80">{contenido}</s>;
        if (t.tipo === "codigo") {
          return (
            <code
              key={i}
              className={cn(
                "rounded px-1 py-0.5 font-mono text-[0.85em]",
                claro ? "bg-white/20" : "bg-black/8 dark:bg-white/10"
              )}
            >
              {t.texto}
            </code>
          );
        }
        return <span key={i}>{contenido}</span>;
      })}
    </>
  );
}

export function CuerpoConFormato({
  body,
  gente,
  yo,
  claro
}: {
  body: string;
  gente: { userId: string; name: string }[];
  yo: string;
  claro: boolean;
}) {
  const partes = useMemo(() => bloques(body), [body]);

  return (
    <div className="flex flex-col gap-1">
      {partes.map((b, i) => {
        if (b.tipo === "codigo") {
          return (
            <pre
              key={i}
              className={cn(
                "overflow-x-auto rounded-lg px-2.5 py-2 font-mono text-[0.8em] leading-snug",
                claro ? "bg-white/15" : "bg-black/8 dark:bg-white/10"
              )}
            >
              {b.texto}
            </pre>
          );
        }
        if (b.tipo === "cita") {
          return (
            <blockquote
              key={i}
              className={cn("border-l-[3px] pl-2.5", claro ? "border-white/45" : "border-line")}
            >
              <Trozos lista={b.trozos} gente={gente} yo={yo} claro={claro} />
            </blockquote>
          );
        }
        if (b.tipo === "vineta") {
          return (
            <div key={i} className="flex gap-2">
              <span aria-hidden className="select-none opacity-60">•</span>
              <span><Trozos lista={b.trozos} gente={gente} yo={yo} claro={claro} /></span>
            </div>
          );
        }
        if (b.tipo === "numero") {
          return (
            <div key={i} className="flex gap-2">
              <span aria-hidden className="select-none tabular-nums opacity-60">{b.indice}.</span>
              <span><Trozos lista={b.trozos} gente={gente} yo={yo} claro={claro} /></span>
            </div>
          );
        }
        // Una línea vacía separa párrafos: se conserva su alto o el mensaje se
        // aplasta y se pierde la intención de quien escribió.
        if (b.trozos.length === 0) return <span key={i} className="h-2" />;
        return (
          <span key={i}>
            <Trozos lista={b.trozos} gente={gente} yo={yo} claro={claro} />
          </span>
        );
      })}
    </div>
  );
}

/**
 * Quién ya vio el mensaje.
 *
 * En un grupo, la doble palomita no dice lo que hace falta saber: si lo vieron
 * TODOS o solo uno. Aquí se nombra a quien lo vio y se cuenta a quien falta,
 * que es la pregunta real cuando mandas un comunicado.
 *
 * No hace falta backend: la sala ya devuelve `readBy` con los ids y `members`
 * con los nombres.
 */
export function QuienLoVio({
  leidoPor,
  miembros,
  autorId
}: {
  leidoPor: string[];
  miembros: { id: string; name: string }[];
  autorId: string;
}) {
  // Ni el autor ni tú cuentan: uno siempre ha visto lo suyo.
  const destinatarios = miembros.filter((m) => m.id !== autorId);
  const vieron = destinatarios.filter((m) => leidoPor.includes(m.id));
  const faltan = destinatarios.length - vieron.length;

  if (destinatarios.length === 0) return null;

  const nombres = vieron.map((m) => m.name.split(" ")[0]).join(", ");

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1 px-1 text-[10px] text-muted">
      <Check size={11} className={vieron.length === destinatarios.length ? "text-volt" : ""} />
      {vieron.length === 0 ? (
        <span>Nadie lo ha visto</span>
      ) : faltan === 0 ? (
        <span className="font-semibold text-volt">Lo vieron todos</span>
      ) : (
        <span>
          Lo vio {nombres} · faltan {faltan}
        </span>
      )}
    </div>
  );
}
