"use client";

import { Capa } from "@/components/Capa";

/**
 * Visor de imágenes a pantalla completa, con zoom.
 *
 * Nació para el chat y desde el 7 de septiembre de 2026 lo usan también
 * comunicados, evidencias, faltantes y las páginas del checklist, a través de
 * `ImagenAmpliable`, al final de este archivo.
 *
 * ⚠️ **El zoom se implementa a mano a propósito.** La app fija
 * `maximumScale: 1` en el viewport (`app/layout.tsx`) para que nadie acerque
 * la interfaz sin querer en el teléfono de la tienda. El efecto secundario es
 * que el pellizco tampoco funciona sobre una foto, y una tabla de metas
 * compartida en el chat se queda ilegible. Este visor no depende del zoom del
 * navegador: mueve la imagen él mismo.
 *
 * Tres formas de acercar, porque no todo el mundo descubre la misma:
 *  - pellizco con dos dedos;
 *  - doble toque, que alterna entre normal y 2.5×;
 *  - rueda del ratón, para el escritorio.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { X, ZoomIn } from "lucide-react";

const MAX = 5;
const MIN = 1;
/** A cuánto lleva el doble toque. */
const SALTO = 2.5;

type Punto = { x: number; y: number };

export function VisorImagen({ url, onClose }: { url: string; onClose: () => void }) {
  const [escala, setEscala] = useState(1);
  const [pos, setPos] = useState<Punto>({ x: 0, y: 0 });

  const arrastre = useRef<{ desde: Punto; inicio: Punto } | null>(null);
  const pellizco = useRef<{ distancia: number; escala: number } | null>(null);
  const ultimoToque = useRef(0);

  const reset = useCallback(() => {
    setEscala(1);
    setPos({ x: 0, y: 0 });
  }, []);

  /*
   * ⚠️ **El botón físico de atrás tiene que cerrar el VISOR, no la pantalla.**
   * En Android es el gesto natural para cerrar cualquier cosa que se abra
   * encima; sin una parada de historial propia, se llevaba por delante la
   * conversación o el comunicado que se estaba leyendo. Se apila una parada al
   * abrir y se retira al cerrar.
   */
  const paradaPuesta = useRef(false);

  /*
   * ⚠️ **`onClose` NO puede ir en las dependencias.** Quien monta el visor lo
   * pasa como función anónima --`onClose={() => setLightbox(null)}`--, así que
   * cambia de identidad en cada pintado: con la dependencia, el efecto se
   * repetiría y apilaría una parada de historial NUEVA cada vez. Haría falta
   * pulsar atrás una docena de veces para salir. Se guarda en una referencia,
   * que siempre tiene la última.
   */
  const refCerrar = useRef(onClose);
  useEffect(() => {
    refCerrar.current = onClose;
  });

  useEffect(() => {
    paradaPuesta.current = true;
    // La MISMA dirección a propósito: se quiere una parada para el botón de
    // atrás, no una ruta nueva que el enrutador tendría que resolver.
    window.history.pushState({ visorClarvex: true }, "", window.location.href);
    const alVolver = () => {
      paradaPuesta.current = false;
      refCerrar.current();
    };
    window.addEventListener("popstate", alVolver);
    return () => window.removeEventListener("popstate", alVolver);
  }, []);

  /*
   * Cerrar a mano: la X, el fondo o Escape.
   *
   * ⚠️ Se avisa al padre DIRECTAMENTE y además se retira la parada. Esperar a
   * que `history.back()` dispare `popstate` para cerrar dejaría el visor
   * pegado si ese evento no llegara; y sin la bandera, el `popstate` que sí
   * llega volvería a cerrar y retrocedería una pantalla de más.
   */
  const cerrar = useCallback(() => {
    if (paradaPuesta.current) {
      paradaPuesta.current = false;
      window.history.back();
    }
    refCerrar.current();
  }, []);

  // Escape cierra, y en escritorio es lo que la gente intenta primero.
  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => { if (e.key === "Escape") cerrar(); };
    window.addEventListener("keydown", alPulsar);
    return () => window.removeEventListener("keydown", alPulsar);
  }, [cerrar]);

  // `React.TouchList` y el `TouchList` del DOM no son el mismo tipo: el de
  // React no es iterable. Se toma el de React, que es el que llega aquí.
  const distanciaEntre = (t: React.TouchList): number => {
    const a = t[0];
    const b = t[1];
    if (!a || !b) return 0;
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      pellizco.current = { distancia: distanciaEntre(e.touches), escala };
      arrastre.current = null;
      return;
    }
    const t = e.touches[0];
    if (!t) return;

    // Doble toque: alterna. Se detecta por tiempo porque `dblclick` no existe
    // en táctil y `onDoubleClick` llega tarde y con retardo de 300 ms.
    const ahora = Date.now();
    if (ahora - ultimoToque.current < 280) {
      setEscala((prev) => (prev > 1 ? 1 : SALTO));
      if (escala > 1) setPos({ x: 0, y: 0 });
      ultimoToque.current = 0;
      return;
    }
    ultimoToque.current = ahora;

    if (escala > 1) arrastre.current = { desde: { x: t.clientX, y: t.clientY }, inicio: pos };
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pellizco.current) {
      const d = distanciaEntre(e.touches);
      if (pellizco.current.distancia > 0) {
        const nueva = (d / pellizco.current.distancia) * pellizco.current.escala;
        setEscala(Math.min(MAX, Math.max(MIN, nueva)));
      }
      return;
    }
    const t = e.touches[0];
    if (!t || !arrastre.current) return;
    setPos({
      x: arrastre.current.inicio.x + (t.clientX - arrastre.current.desde.x),
      y: arrastre.current.inicio.y + (t.clientY - arrastre.current.desde.y)
    });
  };

  const onTouchEnd = () => {
    pellizco.current = null;
    arrastre.current = null;
    // Al volver a 1× se recentra: si no, la imagen se queda desplazada fuera
    // de la pantalla y parece que se perdió.
    if (escala <= 1) setPos({ x: 0, y: 0 });
  };

  return (
    /* ⚠️ En `Capa` --portal al `body`--, o la barra de abajo se pinta ENCIMA
       del visor: dentro de una pantalla, un `fixed` queda atrapado en el
       contexto de apilamiento del envoltorio y su `z-70` solo compite con
       sus hermanos. El porqué, en `components/Capa.tsx`. */
    <Capa>
    <div
      className="fixed inset-0 z-70 flex items-center justify-center overflow-hidden bg-black/95"
      onClick={() => { if (escala <= 1) cerrar(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Imagen"
    >
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); cerrar(); }}
        aria-label="Cerrar"
        className="absolute right-4 z-10 grid size-10 place-items-center rounded-full bg-white/15 text-white"
        style={{ top: "max(1rem, var(--safe-top))" }}
      >
        <X size={22} />
      </button>

      {escala > 1 ? (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); reset(); }}
          className="absolute left-4 z-10 rounded-full bg-white/15 px-3 py-2 text-xs font-semibold text-white"
          style={{ top: "max(1rem, var(--safe-top))" }}
        >
          {escala.toFixed(1)}× · Ajustar
        </button>
      ) : (
        // Se dice que se puede acercar: el pellizco no se descubre solo cuando
        // el resto de la app no deja hacerlo.
        <span
          className="pointer-events-none absolute left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-white/12 px-3 py-1.5 text-[11px] font-medium text-white/80"
          style={{ bottom: "max(1.5rem, var(--safe-bottom))" }}
        >
          <ZoomIn size={13} /> Pellizca o toca dos veces para acercar
        </span>
      )}

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt="Imagen"
        draggable={false}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onDoubleClick={(e) => {
          e.stopPropagation();
          setEscala((prev) => (prev > 1 ? 1 : SALTO));
          setPos({ x: 0, y: 0 });
        }}
        onWheel={(e) => {
          const nueva = escala - e.deltaY * 0.002;
          setEscala(Math.min(MAX, Math.max(MIN, nueva)));
          if (nueva <= 1) setPos({ x: 0, y: 0 });
        }}
        className="max-h-full max-w-full touch-none select-none object-contain"
        style={{
          transform: `translate(${pos.x}px, ${pos.y}px) scale(${escala})`,
          // Sin transición durante el gesto: seguiría al dedo con retraso y se
          // sentiría pegajoso. Solo al soltar, para el doble toque.
          transition: arrastre.current || pellizco.current ? "none" : "transform 160ms ease-out",
          cursor: escala > 1 ? "grab" : "zoom-in"
        }}
      />
    </div>
    </Capa>
  );
}

/**
 * Una imagen que se abre en el visor en vez de en el navegador.
 *
 * ⚠️ **El fallo que viene a arreglar es exclusivo de la app.** Comunicados,
 * evidencias, faltantes y las páginas del checklist colgaban su miniatura de un
 * `<a target="_blank">`. En un navegador eso abre una pestaña y se vuelve con
 * atrás; dentro del WebView **no hay pestañas**, así que Android se lo pasaba a
 * Chrome: tocar el flyer de un comunicado te sacaba de la app, y volver
 * significaba buscarla entre las aplicaciones abiertas. El chat no lo sufría
 * porque ya usaba este visor.
 *
 * ⚠️ **El botón físico de atrás cierra el VISOR, no la pantalla.** Se apila una
 * parada en el historial al abrirlo. Sin eso, atrás --que en Android es el
 * gesto natural para cerrar cualquier cosa que se abre encima-- se llevaba por
 * delante el comunicado que se estaba leyendo.
 */
export function ImagenAmpliable({
  src,
  alt,
  className,
  children
}: {
  src: string;
  alt: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} className={className} aria-label={`Ampliar: ${alt}`}>
        {children}
      </button>
      {abierto ? <VisorImagen url={src} onClose={() => setAbierto(false)} /> : null}
    </>
  );
}
