"use client";

import { RotateCw, WifiOff } from "lucide-react";

/**
 * Lo que se ve cuando la pantalla no pudo traer sus datos.
 *
 * ⚠️ **Existe porque antes no se veía NADA.** Cuatro pantallas de Conteos se
 * quedaban en «Cargando…» para siempre si la primera petición fallaba, y desde
 * fuera eso es idéntico a una carga lenta: la persona espera, y sigue
 * esperando. Con la señal del centro comercial cayéndose a diario, ese estado
 * no es raro.
 *
 * Tres decisiones, y ninguna es de adorno:
 *
 * ⚠️ **Dice qué pasó y qué hacer**, no «Error». Quien lo lee está de pie, con
 * gente delante y el teléfono en la mano; un mensaje que no da el siguiente
 * paso cuesta una llamada a gerencia.
 *
 * ⚠️ **Hay un botón aunque se reintente solo.** `useCargaConReintento` vuelve a
 * intentarlo al volver a la app y al recuperar la señal, pero eso la persona no
 * lo sabe: sin algo que tocar, la pantalla sigue pareciendo rota. El botón es
 * para ella, no para la máquina.
 *
 * ⚠️ **No promete que lo capturado esté a salvo.** Esto es una pantalla de
 * LECTURA: lo que falló fue traer la lista, no guardar nada. Decir «no se perdió
 * nada» aquí sería tranquilizar sobre algo que esta pantalla no sabe.
 */
export function NoSePudoCargar({
  cargando,
  onReintentar,
  que = "esta pantalla"
}: {
  cargando: boolean;
  onReintentar: () => void;
  /** Qué no se pudo traer, para que el mensaje nombre la cosa concreta. */
  que?: string;
}) {
  return (
    <div className="mt-4 rounded-[20px] border border-line bg-card px-5 py-6 text-center">
      <span className="mx-auto grid size-11 place-items-center rounded-[15px] bg-ember/12 text-ember">
        <WifiOff size={19} />
      </span>
      <p className="mt-3 text-[15px] font-semibold text-ink">No se pudo cargar {que}</p>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">
        Puede ser la señal. Se intenta solo en cuanto vuelva, o puedes reintentar ahora.
      </p>
      <button
        type="button"
        onClick={onReintentar}
        disabled={cargando}
        className="tappable mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-ink px-4 text-sm font-semibold text-card transition active:scale-95 disabled:opacity-55"
      >
        <RotateCw size={16} className={cargando ? "animate-spin" : undefined} />
        {cargando ? "Reintentando…" : "Reintentar"}
      </button>
    </div>
  );
}
