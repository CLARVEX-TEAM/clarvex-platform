"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { getSession } from "@/lib/auth";
import type { LegalDoc } from "@/lib/legal";

// Compuerta de consentimiento (firma digital tipo click-wrap): al primer ingreso
// —o al cambiar la versión de algún documento legal— el usuario debe aceptar los
// documentos pendientes antes de seguir usando la app. Cada aceptación se
// registra en el servidor con documento, versión, fecha, IP y user-agent.

const EXCLUDED = ["/login", "/terminos", "/privacidad", "/uso-aceptable", "/politica-privacidad", "/cookies", "/reembolsos", "/seguridad", "/legal", "/conteos/marbetes/imprimir", "/suspendida"];

export function TermsGate() {
  const pathname = usePathname();
  const [pending, setPending] = useState<LegalDoc[]>([]);
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);

  const excluded = !pathname || EXCLUDED.some((route) => pathname === route || pathname.startsWith(`${route}/`));

  useEffect(() => {
    if (excluded) { setShow(false); return; }
    let cancelled = false;
    // Chequeo con reintentos: si el primer login coincide con un parpadeo de red,
    // igual debe aparecer el aviso. No se rinde a la primera falla.
    void (async () => {
      const session = await getSession().catch(() => null);
      if (!session || cancelled) return;
      // Modo demo: nunca se le pide aceptar términos (un visitante no firma nada
      // legal, y además su sesión es de SOLO LECTURA: no podría guardar).
      if ((session as { demo?: boolean }).demo) { if (!cancelled) setShow(false); return; }
      for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
          const res = await fetch("/api/legal/accept", { cache: "no-store" });
          if (!res.ok) throw new Error(String(res.status));
          const data = (await res.json()) as { accepted?: boolean; pending?: LegalDoc[] };
          if (!cancelled) {
            setPending(data.pending ?? []);
            setShow(data.accepted === false);
          }
          return;
        } catch {
          if (cancelled) return;
          await new Promise((r) => setTimeout(r, 700 * (attempt + 1)));
        }
      }
    })();
    return () => { cancelled = true; };
  }, [pathname, excluded]);

  // Mientras el aviso está visible, bloquea el scroll del fondo para que la app
  // no se pueda usar por detrás.
  useEffect(() => {
    if (!show) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [show]);

  async function accept() {
    setSaving(true);
    try {
      const res = await fetch("/api/legal/accept", { method: "POST" });
      if (res.ok) setShow(false);
    } finally {
      setSaving(false);
    }
  }

  // Enlaces a los documentos pendientes (o a todos, si por alguna razón no llegó
  // la lista pero igual hay que aceptar).
  const docs = pending.length > 0 ? pending : [];

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-120 flex items-end justify-center bg-black/60 p-4 backdrop-blur-xs sm:items-center"
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: "spring", stiffness: 340, damping: 30 }}
            className="w-full max-w-md rounded-[26px] border border-line bg-card p-5 shadow-2xl"
          >
            <span className="mb-3 grid size-12 place-items-center rounded-2xl bg-volt/12 text-2xl">
              📋
            </span>
            <h2 className="text-lg font-semibold text-ink">Términos y privacidad</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">
              Para usar Clarvex Team necesitas aceptar los siguientes documentos. Tu aceptación queda registrada con la fecha, la versión y tu equipo.
            </p>
            <ul className="mt-3 grid gap-1.5">
              {docs.map((doc) => (
                <li key={doc.key}>
                  <a
                    href={doc.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between rounded-2xl border border-line bg-panel px-3.5 py-2.5 text-sm font-semibold text-ink transition hover:border-volt/40"
                  >
                    <span>{doc.label}</span>
                    <span className="text-xs font-bold text-volt">Leer →</span>
                  </a>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => void accept()}
              disabled={saving}
              className="mt-4 w-full rounded-2xl bg-volt py-3 text-sm font-semibold text-white transition active:scale-95 disabled:opacity-50"
            >
              {saving ? "Guardando…" : docs.length > 1 ? "Acepto todos los documentos" : "Acepto"}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
