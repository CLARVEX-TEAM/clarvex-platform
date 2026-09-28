"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LifeBuoy, CheckCircle2, Send, ChevronRight } from "lucide-react";
import { AppFrame, AppHeader, Card } from "@/components/ui";
import { cn } from "@/lib/utils";
import { encolar } from "@/lib/cola-envio";
import { comoSeDice, hace, type EstadoCaso } from "@/lib/soporte";

type CasoEnLista = {
  id: string;
  folio: string;
  asunto: string;
  estado: EstadoCaso;
  abierto: string;
};

const CATEGORIES = [
  { key: "problema", label: "Problema" },
  { key: "duda", label: "Duda" },
  { key: "solicitud", label: "Solicitud" }
] as const;

export default function SoportePage() {
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]["key"] | null>(null);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  /** Quedó guardado sin señal: se dice distinto, porque todavía no llegó. */
  const [guardado, setGuardado] = useState(false);
  const [casos, setCasos] = useState<CasoEnLista[]>([]);

  /*
   * Los casos anteriores. Si falla no se dice nada: lo que trae a alguien a esta
   * pantalla es escribir, y un error sobre una lista que igual está vacía solo
   * estorbaría delante del formulario.
   */
  useEffect(() => {
    let vivo = true;
    fetch("/api/support/casos", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { casos?: CasoEnLista[] } | null) => { if (vivo && d?.casos) setCasos(d.casos); })
      .catch(() => undefined);
    return () => { vivo = false; };
  }, [sent]);

  const canSend = subject.trim().length >= 3 && message.trim().length >= 10 && !sending;

  async function send() {
    if (!canSend) return;
    setSending(true);
    setError("");
    const cuerpo = JSON.stringify({
      subject: subject.trim(),
      message: message.trim(),
      category: category ?? undefined,
      fromUrl: typeof document !== "undefined" ? document.referrer || undefined : undefined
    });

    try {
      let res: Response;
      try {
        res = await fetch("/api/support", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: cuerpo
        });
      } catch {
        /*
         * ⚠️ Sin red NO se pierde lo escrito. Quien reporta un problema suele
         * estar justo donde la señal falla --el almacén, el probador-- y hasta
         * ahora el mensaje se borraba con un «intenta de nuevo».
         *
         * Se manda solo al volver la señal, y sin duplicar: la ruta ya lleva la
         * guarda de idempotencia, porque un reintento abriría un SEGUNDO ticket
         * en Zendesk.
         */
        const encolado = await encolar({
          ruta: "/api/support",
          etiqueta: `Soporte: ${subject.trim().slice(0, 40)}`,
          campos: [],
          json: cuerpo
        });
        if (encolado) { setSent(true); setGuardado(true); }
        else setError("Sin conexión y sin sitio para guardarlo. Inténtalo de nuevo.");
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) { setError(data.error ?? "No se pudo enviar. Intenta de nuevo."); return; }
      setSent(true);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <AppHeader title="Soporte" subtitle="¿Necesitas ayuda? Escríbenos." backHref="/perfil" />
      <AppFrame>
        {casos.length > 0 && !sent ? (
          <Card className="mb-3 p-0">
            <p className="px-4 pb-1 pt-3.5 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">Tus casos</p>
            <ul>
              {casos.map((caso) => {
                const dicho = comoSeDice(caso.estado);
                return (
                  <li key={caso.id} className="border-t border-line/60 first:border-t-0">
                    <Link
                      href={`/soporte/${caso.id}`}
                      className="flex items-center gap-3 px-4 py-3 transition active:scale-[0.99]"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-ink">{caso.asunto}</span>
                        <span className="mt-0.5 block text-[11px] text-muted">
                          {caso.folio} · {hace(new Date(caso.abierto))}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2 py-1 text-[10px] font-bold",
                          dicho.tono === "bien" ? "bg-mint/12 text-mint"
                          : dicho.tono === "aviso" ? "bg-ember/15 text-ember"
                          : "bg-white/8 text-muted"
                        )}
                      >
                        {dicho.texto}
                      </span>
                      <ChevronRight size={16} className="shrink-0 text-muted" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
        ) : null}

        {sent ? (
          <Card className="p-6 text-center">
            <span className="mx-auto mb-3 grid size-14 place-items-center rounded-2xl bg-volt/10 text-volt">
              <CheckCircle2 size={28} />
            </span>
            <h2 className="text-lg font-semibold text-ink">{guardado ? "Guardado sin conexión" : "¡Mensaje enviado!"}</h2>
            <p className="mt-1.5 text-sm text-muted">
              {guardado
                ? "Se enviará solo en cuanto vuelva la señal. No hace falta que lo escribas otra vez."
                : "Nuestro equipo de soporte lo recibió y te contactará. Gracias por avisarnos."}
            </p>
            <button
              type="button"
              onClick={() => { setSent(false); setSubject(""); setMessage(""); setCategory(null); }}
              className="mt-4 rounded-2xl border border-line px-4 py-2.5 text-sm font-semibold text-ink transition active:scale-95"
            >
              Enviar otro
            </button>
          </Card>
        ) : (
          <Card className="p-4">
            <div className="mb-3 flex items-center gap-2.5">
              <span className="grid size-9 place-items-center rounded-2xl bg-volt/12 text-volt"><LifeBuoy size={18} /></span>
              <p className="text-sm font-semibold text-ink">Cuéntanos qué pasa</p>
            </div>

            {/* Categoría */}
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">Tipo</p>
            <div className="mb-3 flex gap-1.5">
              {CATEGORIES.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setCategory(category === c.key ? null : c.key)}
                  className={cn(
                    "flex-1 rounded-2xl border px-2 py-2.5 text-xs font-semibold transition active:scale-95",
                    category === c.key ? "border-volt/40 bg-volt/12 text-volt" : "border-line bg-panel text-muted"
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>

            {/* Asunto */}
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">Asunto</p>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value.slice(0, 150))}
              placeholder="Ej. No me carga el ranking"
              className="mb-3 min-h-11 w-full rounded-2xl border border-line bg-panel px-3.5 text-sm font-semibold text-ink outline-hidden transition focus:border-volt focus:ring-4 focus:ring-volt/10"
            />

            {/* Mensaje */}
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">Mensaje</p>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, 4000))}
              placeholder="Descríbelo con el mayor detalle posible: qué esperabas, qué pasó y en qué pantalla."
              rows={6}
              className="w-full resize-none rounded-2xl border border-line bg-panel px-3.5 py-2.5 text-sm font-semibold text-ink outline-hidden transition focus:border-volt focus:ring-4 focus:ring-volt/10"
            />

            {error && <p className="mt-2 text-xs font-semibold text-orchid">{error}</p>}

            <button
              type="button"
              onClick={() => void send()}
              disabled={!canSend}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-volt py-3 text-sm font-semibold text-white transition active:scale-95 disabled:opacity-50"
            >
              <Send size={16} /> {sending ? "Enviando…" : "Enviar a soporte"}
            </button>
            <p className="mt-2.5 text-center text-[11px] text-muted">
              Se enviará con tu nombre, tienda y rol para que podamos ayudarte mejor.
            </p>
          </Card>
        )}
      </AppFrame>
    </>
  );
}
