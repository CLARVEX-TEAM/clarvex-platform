"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, WifiOff } from "lucide-react";

/**
 * Banner global de conexión. Avisa "Sin conexión" en rojo mientras no hay red,
 * y al reconectar muestra brevemente "Conexión restablecida" y avisa a la app
 * (evento "clarvex-online") para que las vistas se refresquen.
 */
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  const [justReconnected, setJustReconnected] = useState(false);

  useEffect(() => {
    if (typeof navigator !== "undefined") setOffline(!navigator.onLine);
    const goOffline = () => setOffline(true);
    const goOnline = () => {
      setOffline((wasOffline) => {
        if (wasOffline) {
          setJustReconnected(true);
          window.dispatchEvent(new Event("clarvex-online"));
          window.setTimeout(() => setJustReconnected(false), 2500);
        }
        return false;
      });
    };
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  return (
    <AnimatePresence>
      {offline ? (
        <motion.div
          key="offline"
          initial={{ y: -48, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -48, opacity: 0 }}
          transition={{ type: "spring", stiffness: 420, damping: 32 }}
          className="fixed inset-x-0 top-0 z-[90] flex items-center justify-center gap-2 bg-rose-500 px-4 text-center text-[13px] font-bold text-white shadow-md"
          style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.45rem)", paddingBottom: "0.45rem" }}
        >
          <WifiOff size={15} /> Sin conexión — revisa tu internet
        </motion.div>
      ) : justReconnected ? (
        <motion.div
          key="online"
          initial={{ y: -48, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -48, opacity: 0 }}
          transition={{ type: "spring", stiffness: 420, damping: 32 }}
          className="fixed inset-x-0 top-0 z-[90] flex items-center justify-center gap-2 bg-emerald-500 px-4 text-center text-[13px] font-bold text-white shadow-md"
          style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.45rem)", paddingBottom: "0.45rem" }}
        >
          <CheckCircle2 size={15} /> Conexión restablecida
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
