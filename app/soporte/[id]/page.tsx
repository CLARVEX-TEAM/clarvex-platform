"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { RefreshCw, Send, WifiOff } from "lucide-react";
import { AppFrame, AppHeader, Card } from "@/components/ui";
import { cn } from "@/lib/utils";
import { comoSeDice, type EstadoCaso, type MensajeDelCaso } from "@/lib/soporte";
import { useSession } from "@/lib/use-session";

/**
 * Un caso de soporte y su conversación.
 *
 * ⚠️ **Zendesk es el dueño del caso; esto es la ventana.** El estado y los
 * mensajes se leen de allí al abrir. Cuando no se puede, se enseña la última
 * copia y **se dice** que no está al día: inventar «resuelto» cerraría un caso
 * abierto, y dejar la pantalla vacía haría desaparecer el caso.
 */

type Caso = {
  folio: string;
  asunto: string;
  categoria: string;
  abierto: string;
  estado: EstadoCaso;
  mensajes: MensajeDelCaso[];
  atencionMinutos: number | null;
  puedeResponder?: boolean;
  alDia: boolean;
};

function atencion(minutos: number | null): string | null {
  // `null` es «todavía no contestan», que NO es cero.
  if (minutos === null) return null;
  if (minutos < 60) return `Contestaron en ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `Contestaron en ${horas} h`;
  const dias = Math.round(horas / 24);
  return dias === 1 ? "Contestaron al día siguiente" : `Contestaron en ${dias} días`;
}

export default function CasoPage() {
  const { session } = useSession({ redirectOnMissing: true });
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [caso, setCaso] = useState<Caso | null>(null);
  const [error, setError] = useState("");
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function cargar() {
    const res = await fetch(`/api/support/casos/${id}`, { cache: "no-store" });
    if (!res.ok) {
      setError(res.status === 404 ? "Ese caso no existe." : "No se pudo abrir el caso.");
      return;
    }
    setCaso((await res.json()) as Caso);
  }

  useEffect(() => {
    if (!session || !id) return;
    let vivo = true;
    (async () => {
      try {
        const res = await fetch(`/api/support/casos/${id}`, { cache: "no-store" });
        if (!vivo) return;
        if (!res.ok) {
          setError(res.status === 404 ? "Ese caso no existe." : "No se pudo abrir el caso.");
          return;
        }
        setCaso((await res.json()) as Caso);
      } catch {
        if (vivo) setError("No hay conexión. Vuelve a abrirlo con señal.");
      }
    })();
    return () => { vivo = false; };
  }, [session, id]);

  async function responder() {
    if (texto.trim().length < 2 || enviando) return;
    setEnviando(true);
    setError("");
    try {
      const res = await fetch(`/api/support/casos/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensaje: texto.trim() })
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setError(d.error ?? "No se pudo enviar tu respuesta.");
        return;
      }
      setTexto("");
      await cargar();
    } catch {
      setError("Sin conexión. Vuelve a intentarlo con señal.");
    } finally {
      setEnviando(false);
    }
  }

  const dicho = caso ? comoSeDice(caso.estado) : null;
  const tardanza = caso ? atencion(caso.atencionMinutos) : null;

  return (
    <>
      <AppHeader title="Caso de soporte" subtitle={caso?.folio ?? "Cargando…"} backHref="/soporte" />
      <AppFrame>
        {error && !caso ? (
          <Card className="px-5 py-6 text-center text-sm font-semibold text-rose-600 dark:text-rose-400">{error}</Card>
        ) : !caso || !dicho ? (
          <Card className="grid h-56 place-items-center">
            <RefreshCw size={20} className="animate-spin text-muted" />
          </Card>
        ) : (
          <>
            <Card className="p-4">
              <div className="flex items-start gap-3">
                <p className="min-w-0 flex-1 text-base font-bold leading-snug text-ink">{caso.asunto}</p>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold",
                    dicho.tono === "bien" ? "bg-mint/12 text-mint"
                    : dicho.tono === "aviso" ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                    : "bg-white/8 text-muted"
                  )}
                >
                  {dicho.texto}
                </span>
              </div>
              <p className="mt-1.5 text-[11px] text-muted">
                {caso.folio} · {new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(new Date(caso.abierto))}
                {tardanza ? ` · ${tardanza}` : ""}
              </p>

              {!caso.alDia ? (
                <p className="mt-3 flex items-start gap-2 rounded-2xl bg-white/6 px-3 py-2.5 text-[11px] leading-relaxed text-muted">
                  <WifiOff size={14} className="mt-0.5 shrink-0" />
                  {/* Se dice, en vez de enseñar un estado viejo como si fuera el de ahora. */}
                  No pudimos consultar el estado más reciente. Esto es lo último que sabíamos.
                </p>
              ) : null}
            </Card>

            {caso.mensajes.length > 0 ? (
              <div className="mt-3 flex flex-col gap-2">
                {caso.mensajes.map((m, i) => (
                  <div
                    key={`${m.fecha}-${i}`}
                    className={cn(
                      "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                      m.mio ? "self-end bg-volt text-white" : "self-start bg-panel text-ink ring-1 ring-line"
                    )}
                  >
                    <p className="whitespace-pre-wrap break-words">{m.texto}</p>
                    {m.fecha ? (
                      <p className={cn("mt-1 text-[10px]", m.mio ? "text-white/70" : "text-muted")}>
                        {new Intl.DateTimeFormat("es-MX", { dateStyle: "short", timeStyle: "short" }).format(new Date(m.fecha))}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}

            {caso.puedeResponder ? (
              <Card className="mt-3 p-3.5">
                <textarea
                  value={texto}
                  onChange={(e) => setTexto(e.target.value.slice(0, 4000))}
                  placeholder="Escribe tu respuesta…"
                  rows={3}
                  className="w-full resize-none rounded-2xl border border-line bg-panel px-3.5 py-2.5 text-sm font-semibold text-ink outline-none transition focus:border-volt focus:ring-4 focus:ring-volt/10"
                />
                {error ? <p className="mt-2 text-xs font-semibold text-rose-600 dark:text-rose-400">{error}</p> : null}
                <button
                  type="button"
                  onClick={() => void responder()}
                  disabled={texto.trim().length < 2 || enviando}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-volt py-3 text-sm font-semibold text-white transition active:scale-95 disabled:opacity-50"
                >
                  <Send size={16} /> {enviando ? "Enviando…" : "Responder"}
                </button>
              </Card>
            ) : (
              <p className="mt-4 px-3 text-center text-[11px] leading-relaxed text-muted/80">
                Este caso está resuelto. Si vuelve a pasarte, abre uno nuevo desde Soporte.
              </p>
            )}
          </>
        )}
      </AppFrame>
    </>
  );
}
