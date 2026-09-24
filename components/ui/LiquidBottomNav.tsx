"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { BarChart3, Boxes, CalendarDays, Home } from "lucide-react";
import { getSession } from "@/lib/auth";
import { enContenedorNativo } from "@/lib/puente-nativo";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";

// Exportada para que `tests/accesos-telefono.test.ts` pueda comprobar que
// ninguna pantalla del teléfono se quede sin puerta de entrada.
//
// ⚠️ Plan, Pendientes, Chat y Actividad salieron con la fase 2 del plan de
// apagado (ver `lib/accesos-telefono.ts`). Sus huecos los ocupan Horarios y
// Conteos, que es para lo que se abre la app.
export const navItems: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/manager", label: "Inicio", icon: Home },
  { href: "/horarios", label: "Horarios", icon: CalendarDays },
  { href: "/conteos", label: "Conteos", icon: Boxes },
  { href: "/kpis", label: "KPIs", icon: BarChart3 }
];

/**
 * Cuánto se deforma la pastilla al viajar, según los saltos de pestaña.
 *
 * Se estira en X y adelgaza en Y para que el volumen parezca constante: es lo
 * que hace leer el movimiento como una gota y no como un rectángulo escalado.
 * El tope de 4 saltos evita que cruzar la barra entera se convierta en una
 * lámina; a partir de ahí la deformación ya no aporta información.
 */
function travelSquash(distance: number) {
  const steps = Math.min(Math.abs(distance), 4);
  return { scaleX: 1 + steps * 0.1, scaleY: 1 - steps * 0.035 };
}

export function LiquidBottomNav() {
  const [homeHref, setHomeHref] = useState("/manager");
  // Se arranca mostrando KPIs y solo se ocultan si la sesión dice que están
  // apagados: si la consulta falla, es preferible una pestaña de más que una
  // barra que baila al cargar.
  const [kpisEnabled, setKpisEnabled] = useState(true);
  // `null` = todavía no se sabe. La barra no se pinta hasta saberlo porque el
  // celular kiosko NO debe verla, y mostrarla un instante le abriría el paso al
  // resto de la app. Vive en el layout, así que esta espera ocurre una vez por
  // sesión, no en cada navegación.
  const [kiosk, setKiosk] = useState<boolean | null>(null);
  const pathname = usePathname();
  const reduce = useReducedMotion();

  useEffect(() => {
    getSession()
      .then((session) => {
        setHomeHref(enContenedorNativo() ? "/mi-dia" : session?.role === "ASESOR" ? "/advisor" : "/manager");
        setKpisEnabled(session?.kpisEnabled !== false);
        setKiosk(session?.checklistOnly === true);
      })
      .catch(() => setKiosk(false));
  }, []);

  const items = kpisEnabled ? navItems : navItems.filter((item) => item.href !== "/kpis");

  const isActive = (item: (typeof navItems)[number]) => {
    const href = item.href === "/manager" ? homeHref : item.href;
    return pathname === href
      || (item.href === "/manager" && (pathname === "/manager" || pathname === "/advisor"))
      || (item.href === "/conteos" && pathname.startsWith("/conteos"));
  };

  // La distancia se lee DURANTE el render en que cambia la pestaña: el ref aún
  // guarda la anterior, y se actualiza después en el efecto. Calcularla en el
  // efecto llegaría tarde, con la pastilla ya en movimiento.
  //
  // Se recuerda la RUTA además del índice porque la lista cambia de tamaño: al
  // resolverse la sesión de una tienda con los KPIs apagados desaparece una
  // pestaña y todos los índices se corren uno. Sin comparar la ruta, esa
  // reordenación se leería como un salto y la barra se estiraría sola al
  // cargar, sin que nadie haya navegado.
  const activeIndex = items.findIndex(isActive);
  const previous = useRef({ index: activeIndex, href: pathname });
  const navigated = previous.current.href !== pathname;
  const travelled = navigated && previous.current.index >= 0 && activeIndex >= 0
    ? activeIndex - previous.current.index
    : 0;
  useEffect(() => { previous.current = { index: activeIndex, href: pathname }; }, [activeIndex, pathname]);

  const squash = reduce ? { scaleX: 1, scaleY: 1 } : travelSquash(travelled);
  const spring = reduce
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 480, damping: 34 };

  if (kiosk !== false) return null;

  return (
    // ⚠️ La separación de abajo es `0.5rem` MÁS la barrita de gestos de Android.
    // Con `bottom-2` a secas la barra quedaba justo encima de esa línea blanca,
    // y ahí el gesto de volver al inicio se comía los toques de la pestaña.
    // El valor lo publica la app; en el navegador y en la PWA vale cero y esto
    // sigue siendo `bottom-2`.
    <nav className="pointer-events-none fixed inset-x-0 bottom-[calc(0.5rem+var(--safe-bottom))] z-30 px-3">
      <div
        className="liquid-glass pointer-events-auto mx-auto grid max-w-md gap-0.5 rounded-[30px] border-line/80 bg-card/90 dark:bg-panel/95 p-1.5 shadow-[0_14px_34px_rgb(15_23_42_/_0.14)] backdrop-blur-xl"
        // El número de columnas sigue al de pestañas: con `grid-cols-6` fijo,
        // ocultar una dejaría un hueco en la barra.
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      >
        {items.map((item) => {
          const href = item.href === "/manager" ? homeHref : item.href;
          const active = isActive(item);
          return (
            <Link
              key={item.href}
              href={href}
              onClick={() => { if (!active) haptic("light"); }}
              aria-current={active ? "page" : undefined}
              className="tappable relative flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-[22px]"
            >
              <span className="relative grid size-9 place-items-center">
                {active ? (
                  // Dos capas a propósito: la de fuera VIAJA (layoutId) y la de
                  // dentro se DEFORMA. Poner la escala en la misma capa que el
                  // layout la haría competir con las transformaciones que
                  // framer-motion usa para interpolar la posición.
                  <motion.span
                    layoutId="bottom-nav-active"
                    aria-hidden
                    className="absolute inset-0"
                    transition={spring}
                  >
                    <motion.span
                      // Arranca estirada en el sentido del viaje y se asienta al
                      // llegar. Solo transform: no toca layout ni pinta filtros,
                      // así que compone en GPU y no repinta la barra.
                      initial={squash}
                      animate={{ scaleX: 1, scaleY: 1 }}
                      transition={spring}
                      className="block size-full rounded-[16px] bg-volt/14 ring-1 ring-volt/25 shadow-[inset_0_1px_0_rgb(255_255_255_/_0.18)]"
                    />
                  </motion.span>
                ) : null}
                <motion.span
                  animate={{ scale: active ? 1.08 : 1, y: active ? -0.5 : 0 }}
                  transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 26 }}
                  className={cn("relative grid place-items-center transition-colors", active ? "icon-bold text-volt" : "text-muted")}
                >
                  <item.icon size={19} />
                </motion.span>
              </span>
              <span className={cn("relative text-[10px] tracking-[-0.01em] transition-colors", active ? "font-semibold text-volt" : "font-bold text-muted")}>
                {item.href === "/manager" && homeHref === "/mi-dia" ? "Hoy" : item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export const BottomNav = LiquidBottomNav;
