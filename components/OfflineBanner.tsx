"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, CloudUpload, TriangleAlert, WifiOff } from "lucide-react";
import { EVENTO_CAMBIO, drenar, olvidarFallidas, resumen } from "@/lib/cola-envio";

/**
 * La franja de estado de arriba. Avisa "Sin conexión", "Conexión restablecida"
 * y --desde la cola sin conexión-- lo que queda por mandar o se perdió.
 *
 * ⚠️ **Es UNA sola franja a propósito.** Dos avisos fijos arriba se tapan entre
 * sí, y el que queda debajo no lo ve nadie.
 *
 * ⚠️ **Las fallidas se enseñan aunque haya conexión y no se quitan solas.** Una
 * captura que no llegó y no se dice deja a la persona creyendo que quedó
 * guardada, que es el fallo que esta app lleva meses persiguiendo en otras
 * formas. Se van cuando la persona dice que ya las rehizo.
 */
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  const [justReconnected, setJustReconnected] = useState(false);
  const [cola, setCola] = useState({ pendientes: 0, fallidas: 0 });

  const releerCola = useCallback(() => {
    void resumen().then(({ pendientes, fallidas }) => setCola({ pendientes, fallidas }));
  }, []);

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

  /*
   * ⚠️ **La cola se vacía por EVENTO, nunca por temporizador.** Insistir cada X
   * segundos gastaría batería sin ninguna señal de que algo haya cambiado.
   *
   * ⚠️ **Y `visibilitychange` no sobra.** En Android el `online` del WebView no
   * siempre llega: volver a la app es la señal que sí existe siempre, y es justo
   * cuando la persona vuelve a estar bajo el wifi de la tienda.
   */
  useEffect(() => {
    releerCola();
    void drenar();

    const vaciar = () => { void drenar(); };
    const alVolver = () => {
      if (document.visibilityState === "visible") vaciar();
    };
    window.addEventListener("clarvex-online", vaciar);
    window.addEventListener(EVENTO_CAMBIO, releerCola);
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      window.removeEventListener("clarvex-online", vaciar);
      window.removeEventListener(EVENTO_CAMBIO, releerCola);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [releerCola]);

  const franja =
    "fixed inset-x-0 top-0 z-[90] flex items-center justify-center gap-2 px-4 text-center text-[13px] font-bold text-white shadow-md";
  const movimiento = {
    initial: { y: -48, opacity: 0 },
    animate: { y: 0, opacity: 1 },
    exit: { y: -48, opacity: 0 },
    transition: { type: "spring" as const, stiffness: 420, damping: 32 }
  };
  const alto = { paddingTop: "calc(env(safe-area-inset-top) + 0.45rem)", paddingBottom: "0.45rem" };

  const pendientes = cola.pendientes > 0
    ? ` · ${cola.pendientes} guardada${cola.pendientes === 1 ? "" : "s"} para enviar`
    : "";

  return (
    <AnimatePresence>
      {offline ? (
        <motion.div key="offline" {...movimiento} data-transient className={`${franja} bg-rose-500`} style={alto}>
          <WifiOff size={15} /> Sin conexión — revisa tu internet{pendientes}
        </motion.div>
      ) : cola.fallidas > 0 ? (
        <motion.div key="fallidas" {...movimiento} data-transient className={`${franja} bg-amber-500`} style={alto}>
          <TriangleAlert size={15} />
          {cola.fallidas} captura{cola.fallidas === 1 ? "" : "s"} no se pudo guardar. Vuelve a hacerla.
          <button
            type="button"
            onClick={() => void olvidarFallidas()}
            className="ml-1 rounded-full bg-white/25 px-2 py-0.5 text-[12px] font-bold"
          >
            Ya está
          </button>
        </motion.div>
      ) : cola.pendientes > 0 ? (
        <motion.div key="cola" {...movimiento} data-transient className={`${franja} bg-sky-600`} style={alto}>
          <CloudUpload size={15} /> Enviando {cola.pendientes} captura{cola.pendientes === 1 ? "" : "s"}…
        </motion.div>
      ) : justReconnected ? (
        <motion.div key="online" {...movimiento} data-transient className={`${franja} bg-emerald-500`} style={alto}>
          <CheckCircle2 size={15} /> Conexión restablecida
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
