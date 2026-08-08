"use client";

import { usePathname } from "next/navigation";

function transitionKey(pathname: string) {
  // Una sola key para todo /escritorio/* evita desmontar DesktopShell en cada
  // clic del menú lateral (antes pedía PIN otra vez al perder unlockedSession).
  if (pathname === "/escritorio" || pathname.startsWith("/escritorio/")) return "/escritorio";
  return pathname;
}

/**
 * Cambio de pantalla INSTANTÁNEO. La `key` por ruta fuerza el re-montaje; no
 * hay animación a propósito.
 *
 * Antes la página entraba desde `opacity: 0` durante 260 ms. En ese cuarto de
 * segundo no se veía ni la pantalla anterior ni la nueva, sino el fondo: se leía
 * como un parpadeo, no como una transición. Un fundido solo funciona si hay algo
 * con qué fundir, y aquí la anterior ya se desmontó.
 *
 * Tampoco se mueve nada: animar `y` es un `transform`, y **cualquier** transform
 * crea un *containing block* que rompe el `position: fixed` de los hijos. Con el
 * fundido anterior, el botón flotante de las pantallas que lo tienen se
 * desplazaba durante la animación.
 *
 * La sensación de movimiento la da la pastilla de la barra inferior, que ahora
 * sobrevive a las navegaciones. Es lo que hacen las apps nativas: la pestaña se
 * anima, el contenido aparece y ya.
 *
 * Si algún día se quiere una transición de verdad, la herramienta es la View
 * Transitions API del navegador: fotografía la pantalla saliente y funde contra
 * la entrante, sin hueco y sin transform sobre el árbol.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return <div key={transitionKey(pathname ?? "")}>{children}</div>;
}
