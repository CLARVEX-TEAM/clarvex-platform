"use client";

import { motion, useReducedMotion } from "framer-motion";

/*
 * El selector de estado de un pendiente.
 *
 * ⚠️ Vive aquí y no dentro de `app/pendientes/page.tsx` porque Next NO permite
 * exportar nada más que el `default` de un archivo de página: intentarlo rompe
 * la comprobación de tipos. Y hacía falta exportarlo para poder probarlo
 * tocándolo, que es la única forma de ver una animación.
 */

/** Los tres estados, en el orden en que avanza un pendiente. */
const ESTADOS = [
  { valor: "PENDIENTE" as const, etiqueta: "Pendiente" },
  { valor: "EN_PROCESO" as const, etiqueta: "En proceso" },
  { valor: "COMPLETADO" as const, etiqueta: "Hecho" }
];

/**
 * ⚠️ El estado llega escrito de varias formas --`"en proceso"` con espacio,
 * `"EN_PROCESO"`, minúsculas--. Normalizarlo en un solo sitio es lo que evita
 * que la pastilla encendida sea la equivocada según de dónde venga el dato.
 */
function normalizaEstado(valor: string): "PENDIENTE" | "EN_PROCESO" | "COMPLETADO" {
  const limpio = valor.trim().toUpperCase().replace(/\s+/g, "_");
  if (limpio === "EN_PROCESO") return "EN_PROCESO";
  if (limpio === "COMPLETADO") return "COMPLETADO";
  return "PENDIENTE";
}

/**
 * El estado del pendiente, en tres pastillas.
 *
 * ⚠️ **La pastilla blanca VIAJA, no aparece y desaparece.** Con `layoutId`,
 * framer-motion interpola la posición entre los tres huecos, así que el cambio
 * de estado se ve como un movimiento y no como un parpadeo. Sin eso, tocar
 * «En proceso» se lee igual que si la pantalla se hubiera recargado.
 *
 * ⚠️ **Y el `layoutId` lleva el id del pendiente dentro.** Con uno fijo, las
 * pastillas de dos tarjetas distintas compartirían identidad y la blanca
 * volaría de una tarjeta a otra al tocarlas. No es teórico: es lo que pasa con
 * `layoutId` repetido.
 */
export function EstadoPendiente({
  id,
  estado,
  onCambiar
}: {
  id: string;
  estado: string;
  onCambiar: (valor: "PENDIENTE" | "EN_PROCESO" | "COMPLETADO") => void;
}) {
  const sinMovimiento = useReducedMotion();
  const actual = normalizaEstado(estado);

  return (
    <div role="group" aria-label="Estado del pendiente" className="flex gap-1 rounded-full bg-panel p-1">
      {ESTADOS.map((opcion) => {
        const activo = actual === opcion.valor;
        const hecho = activo && opcion.valor === "COMPLETADO";
        return (
          <button
            key={opcion.valor}
            type="button"
            aria-pressed={activo}
            onClick={() => { if (!activo) onCambiar(opcion.valor); }}
            className="tappable relative min-h-11 flex-1 rounded-full text-[13px] font-semibold"
          >
            {activo ? (
              <motion.span
                layoutId={`estado-${id}`}
                aria-hidden
                transition={sinMovimiento ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 34 }}
                className={`absolute inset-0 rounded-full shadow-[0_2px_6px_rgb(7_31_71/0.10)] ${hecho ? "bg-mint" : "bg-card"}`}
              />
            ) : null}
            <span className={`relative flex items-center justify-center gap-1.5 ${activo ? (hecho ? "text-white" : "text-ink") : "text-muted"}`}>
              {hecho ? <PalomitaDibujada quieta={Boolean(sinMovimiento)} /> : null}
              {opcion.etiqueta}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * La palomita se DIBUJA al llegar a «Hecho».
 *
 * ⚠️ No es un icono que aparece: es un trazo que se traza, animando
 * `pathLength`. Un icono que aparece de golpe no se distingue de uno que ya
 * estaba, y lo que se quiere celebrar aquí es el CAMBIO.
 */
function PalomitaDibujada({ quieta }: { quieta: boolean }) {
  return (
    <motion.svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      initial={quieta ? false : { scale: 0.6 }}
      animate={{ scale: 1 }}
      transition={{ type: "spring", stiffness: 500, damping: 18 }}
    >
      <motion.path
        d="M4 12.5 9.5 18 20 6.5"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={quieta ? false : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.34, ease: "easeOut" }}
      />
    </motion.svg>
  );
}

