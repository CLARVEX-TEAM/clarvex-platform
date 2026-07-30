"use client";

import { Meteors } from "@/components/magic/Meteors";

/**
 * Fondo del escritorio. Tres capas, todas detrás del contenido y ninguna
 * capturando eventos:
 *
 *  1. Rejilla fina, estática. Da estructura y sensación de instrumento; al ser
 *     un gradiente CSS no cuesta ni un nodo ni un frame.
 *  2. Dos resplandores del acento que derivan muy despacio. Aportan la
 *     profundidad que un lienzo plano de 1920px no tiene.
 *  3. Meteoritos, con MÁS densidad que en móvil (14 frente a 6): aquí hay
 *     cuatro veces más superficie y seis estelas se pierden.
 *
 * El componente Meteors ya trae las salvaguardas: se apaga con la pestaña
 * oculta y no renderiza nada bajo prefers-reduced-motion. Los resplandores
 * paran su deriva por CSS en ese mismo caso.
 */
export function DeskBackdrop() {
  return (
    <div className="desk-backdrop" aria-hidden="true">
      <div className="desk-grid" />
      <div className="desk-glow desk-glow-a" />
      <div className="desk-glow desk-glow-b" />
      <Meteors count={14} />
    </div>
  );
}
