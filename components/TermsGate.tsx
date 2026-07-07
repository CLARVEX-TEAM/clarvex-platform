"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { FileCheck2 } from "lucide-react";
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
    void (async () => {
      const session = await getSession();
      if (!session || cancelled) return;
      try {
        const res = await fetch("/api/legal/accept", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { accepted?: boolean };
        if (!cancelled) setShow(data.accepted === false);
      } catch { /* sin conexión: no bloquear */ }
    })();
    return () => { cancelled = true; };
  }, [pathname, excluded]);

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
            <span className="mb-3 grid size-12 place-items-center rounded-2xl bg-volt/12 text-volt">
              <FileCheck2 size={24} />
            </span>
            <h2 className="text-lg font-black text-ink">Términos y privacidad</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">
              Para usar Clarvex Team necesitas aceptar los{" "}
              <Link href="/terminos" target="_blank" className="font-black text-volt underline">Términos de Servicio</Link>{" "}
              y el{" "}
              <Link href="/privacidad" target="_blank" className="font-black text-volt underline">Aviso de Privacidad</Link>.
              Tu aceptación queda registrada con fecha y versión.
            </p>
            <button
              type="button"
              onClick={() => void accept()}
              disabled={saving}
              className="mt-4 w-full rounded-2xl bg-volt py-3 text-sm font-black text-white transition active:scale-95 disabled:opacity-50"
            >
              {saving ? "Guardando…" : "Acepto los términos y el aviso de privacidad"}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
