"use client";

/**
 * Fondo vivo del chat.
 *
 * Solo monta la capa; los colores y el movimiento viven en `app/globals.css`
 * junto al resto de animaciones del proyecto, que es donde alguien las va a
 * buscar.
 *
 * ⚠️ `pointer-events-none` no es opcional: sin ello esta capa se come los
 * toques de los mensajes que tiene encima y el chat deja de responder, sin que
 * se vea por qué.
 */

export function FondoAurora() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="aurora-mancha absolute inset-[-40%]" />
    </div>
  );
}
