"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { getSession } from "@/lib/auth";

// Compuerta de consentimiento: al primer ingreso (o al cambiar la versión de
// los términos) el usuario debe aceptar Términos y Aviso de Privacidad antes
// de seguir usando la app. La aceptación queda registrada (fecha + versión).

const EXCLUDED = ["/login", "/terminos", "/privacidad", "/partido/ver", "/conteos/marbetes/imprimir", "/suspendida"];

export function TermsGate() {
  const pathname = usePathname();
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
      for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
          const res = await fetch("/api/legal/accept", { cache: "no-store" });
          if (!res.ok) throw new Error(String(res.status));
          const data = (await res.json()) as { accepted?: boolean };
          if (!cancelled) setShow(data.accepted === false);
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

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[120] flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
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
              Para usar Clarvex Team necesitas aceptar los{" "}
              <a href="/terminos" target="_blank" rel="noreferrer" className="font-semibold text-volt underline">Términos de Servicio</a>{" "}
              y el{" "}
              <a href="/privacidad" target="_blank" rel="noreferrer" className="font-semibold text-volt underline">Aviso de Privacidad</a>.
              Tu aceptación queda registrada con fecha y versión.
            </p>
            <button
              type="button"
              onClick={() => void accept()}
              disabled={saving}
              className="mt-4 w-full rounded-2xl bg-volt py-3 text-sm font-semibold text-white transition active:scale-95 disabled:opacity-50"
            >
              {saving ? "Guardando…" : "Acepto los términos y el aviso de privacidad"}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
