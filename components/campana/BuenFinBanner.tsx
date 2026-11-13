"use client";

import { useEffect, useId, useState } from "react";
import { buenFinActivo, siguienteCambioBuenFin } from "@/lib/buen-fin";
import styles from "./BuenFinBanner.module.css";

const vistaPrevia = process.env.NODE_ENV === "development" &&
  process.env.NEXT_PUBLIC_BUEN_FIN_PREVIEW === "1";

const MAX_ESPERA_MS = 2_147_483_647;

export function BuenFinBanner({ variante = "compacta" }: { variante?: "compacta" | "amplia" }) {
  const titulo = useId();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (vistaPrevia) {
      setVisible(true);
      return;
    }

    let temporizador: number | undefined;
    function actualizar() {
      window.clearTimeout(temporizador);
      const ahora = Date.now();
      setVisible(buenFinActivo(ahora));

      const cambio = siguienteCambioBuenFin(ahora);
      if (cambio !== null) {
        temporizador = window.setTimeout(actualizar, Math.min(cambio - ahora, MAX_ESPERA_MS));
      }
    }

    actualizar();
    // Al volver del segundo plano, el WebView puede haber suspendido el temporizador.
    document.addEventListener("visibilitychange", actualizar);
    window.addEventListener("pageshow", actualizar);
    window.addEventListener("focus", actualizar);
    return () => {
      window.clearTimeout(temporizador);
      document.removeEventListener("visibilitychange", actualizar);
      window.removeEventListener("pageshow", actualizar);
      window.removeEventListener("focus", actualizar);
    };
  }, []);

  if (!visible) return null;

  return (
    <section className={styles.banner} data-variante={variante} aria-labelledby={titulo}>
      <div className={styles.contenido}>
        <h2 className={styles.titulo} id={titulo}>El Buen Fin 2026</h2>
        <p className={styles.fechas}>
          <time dateTime="2026-11-13">13</time>–<time dateTime="2026-11-17">17 de noviembre</time>
        </p>
        <p className={styles.mensaje}>Cada venta cuenta para alcanzar la meta.</p>
      </div>
      <div className={styles.ventas} aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </section>
  );
}
