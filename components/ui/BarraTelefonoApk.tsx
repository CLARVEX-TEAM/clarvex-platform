"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useReducedMotion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { BarChart3, Boxes, Home, LayoutGrid, ScanLine } from "lucide-react";
import { getSession } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";

/**
 * La barra de abajo: una píldora flotante con cuatro destinos y una acción.
 *
 * ⚠️ **Antes llevaba SEIS** --Inicio, Plan, Pendientes, Chat, KPIs, Actividad--
 * puestos a ojo. Medido contra la base el 27 de septiembre de 2026, en treinta
 * días: Conteos **452** marbetes, Checklist **147** entre tareas y páginas
 * escaneadas, Chat **15** mensajes, Comunicados **6** lecturas, Pendientes
 * **5**, Capacitación y Evidencias **0**. Los dos primeros no estaban en la
 * barra; cuatro de los seis que sí estaban no llegan a un toque diario.
 *
 * ⚠️ **KPIs no sale en esa cuenta y aun así tiene sitio, a propósito.** Esa
 * tabla mide lo que se ESCRIBE, y KPIs solo se lee: por ese método una pantalla
 * de solo consulta marca cero aunque la abra todo el mundo. Lo poco que hay
 * apunta al revés --en la métrica de pantallas es la que más PERSONAS distintas
 * tocan-- y es decisión del usuario, que ve la tienda. Cuando la métrica cumpla
 * su mes, este hueco es el primero que hay que volver a mirar.
 *
 * Lo demás no desaparece: vive detrás de «Todo», y
 * `tests/accesos-telefono.test.ts` comprueba que ninguna pantalla se quede sin
 * puerta.
 */

/**
 * ⚠️ **Sin etiquetas, y es una CONSECUENCIA, no un gusto.** Con dos destinos
 * cabía la palabra del activo. Con cuatro más la acción, el hueco de cada uno
 * baja a ~60 px en un teléfono de 360: ahí una etiqueta o se recorta --y una
 * etiqueta recortada es una etiqueta que nadie lee, que es lo que ya pasó con
 * «Pend.» y «Actividad»-- o empuja los tocables por debajo de los 44 px.
 *
 * Lo que compensa la falta de palabra: la pastilla rellena dice dónde estás,
 * cada icono conserva su `aria-label` --para un lector de pantalla un icono sin
 * texto no es nada-- y «Todo» está a un toque con los nombres escritos.
 */

// Exportada para que `tests/accesos-telefono.test.ts` pueda comprobar que
// ninguna pantalla del teléfono se quede sin puerta de entrada.
export const NAV_APK: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/manager", label: "Inicio", icon: Home },
  { href: "/conteos", label: "Conteos", icon: Boxes },
  { href: "/kpis", label: "KPIs", icon: BarChart3 },
  { href: "/todo", label: "Todo", icon: LayoutGrid }
];

/**
 * A dónde lleva el botón del centro.
 *
 * ⚠️ **Escanear sin destino no significa nada**: un marbete solo cuenta dentro
 * de un conteo. La pantalla del conteo diario abre el de HOY y lo crea si no
 * existe, que es exactamente lo que hace la tienda --hay un conteo por día y
 * nadie los cierra: el 26 de septiembre había ocho abiertos, uno por jornada--.
 *
 * ⚠️ Y **no depende del escáner nativo**. Dentro de la APK esa pantalla usa el
 * de Google; en iPhone y en la PWA usa el de la cámara, que ya existe. El botón
 * lleva al mismo sitio en los dos casos, así que no hay una barra que funcione
 * en unos teléfonos y en otros no.
 */
const ESCANEAR_HREF = "/conteos/dama";

export function BarraTelefonoApk() {
  // ⚠️ Dentro de la APK la portada es SIEMPRE «Mi día»: `/manager` y `/advisor`
  // se redirigen ahí al montar. No hace falta preguntarlo --quien pinta esta
  // barra ya comprobó que estamos en el contenedor-- y preguntarlo otra vez
  // daría a entender que puede salir «no», que aquí es imposible.
  const homeHref = "/mi-dia";
  // `null` = todavía no se sabe. La barra no se pinta hasta saberlo porque el
  // celular kiosko NO debe verla, y mostrarla un instante le abriría el paso al
  // resto de la app. Vive en el layout, así que esta espera ocurre una vez por
  // sesión, no en cada navegación.
  const [kiosk, setKiosk] = useState<boolean | null>(null);
  // ⚠️ KPIs se puede APAGAR por tienda (`kpisEnabled`), y donde está apagado la
  // pantalla no enseña nada. Pintar su icono ahí sería una puerta que no lleva
  // a ningún sitio; prefiere una barra de tres destinos antes que eso. Se
  // decide con la MISMA bandera que usa `accesosPara`, para que la barra y el
  // catálogo no puedan contradecirse.
  const [puedeKpis, setPuedeKpis] = useState(false);
  const pathname = usePathname();
  const reduce = useReducedMotion();

  useEffect(() => {
    getSession()
      .then((session) => {
        setPuedeKpis(session ? session.kpisEnabled !== false : false);
        setKiosk(session?.checklistOnly === true);
      })
      .catch(() => setKiosk(false));
  }, []);

  const enPortada = pathname === "/mi-dia" || pathname === "/manager" || pathname === "/advisor";
  /*
   * ⚠️ Se compara el PREFIJO, no la ruta exacta. `/conteos/dama` --que es a
   * donde lleva el botón de escanear-- y `/conteos/<id>` son Conteos. Con
   * igualdad exacta, escanear encendía «Todo»: la barra decía que estabas en el
   * catálogo mientras contabas marbetes.
   */
  const enSeccion = (raiz: string) => pathname === raiz || pathname.startsWith(`${raiz}/`);
  /*
   * ⚠️ **El botón del centro SÍ se marca, y se lleva la marca de Conteos.**
   *
   * Es la pantalla a la que él lleva, así que mientras estás ahí es él quien
   * dice dónde estás. Encender Conteos en su lugar deja al botón que acabas de
   * tocar apagado y señalando a otro sitio: se lee como que el toque no entró.
   *
   * Por eso `conteosActivo` lo EXCLUYE. Sin esa resta se encenderían los dos, y
   * dos marcas a la vez no dicen dónde estás: dicen que la barra no lo sabe.
   */
  const escanearActivo = pathname === ESCANEAR_HREF;
  const conteosActivo = enSeccion("/conteos") && !escanearActivo;
  const kpisActivo = puedeKpis && enSeccion("/kpis");
  /*
   * ⚠️ «Todo» recoge TODO lo que no tiene su propio destino, no solo `/todo`.
   *
   * Con cuatro destinos es tentador encenderlo solo en su pantalla, y entonces
   * en Horarios o en Comunicados no se enciende nada: la barra deja de decir
   * dónde estás justo donde más falta hace, porque son las pantallas a las que
   * se llega por ahí. Uno de los cinco SIEMPRE tiene que estar encendido.
   */
  const todoActivo = !enPortada && !conteosActivo && !kpisActivo && !escanearActivo;

  if (kiosk !== false) return null;

  const destino = (href: string, label: string, Icono: LucideIcon, activo: boolean) => (
    <Link
      key={href}
      href={href}
      onClick={() => { if (!activo) haptic("light"); }}
      aria-current={activo ? "page" : undefined}
      aria-label={label}
      className={cn(
        // ⚠️ `h-11` son 44 px: el mínimo tocable. Por debajo empiezan los toques
        // que no registran, y contando marbetes eso se paga.
        "tappable flex h-11 flex-1 basis-0 items-center justify-center rounded-full",
        !reduce && "transition-colors duration-200",
        activo ? "bg-ink/10 text-ink" : "text-muted"
      )}
    >
      <Icono size={21} className={activo ? "icon-bold" : undefined} />
    </Link>
  );

  return (
    /*
     * ⚠️ Flotante, así que el despeje va en `bottom` y lleva `--safe-bottom`:
     * en Android la barrita de gestos se come los toques que caen encima de
     * ella --`env(safe-area-inset-*)` NO la reporta; la publica la app--. En el
     * navegador y en la PWA vale cero y esto queda en 12 px.
     *
     * ⚠️ El hueco que `AppFrame` deja abajo tiene que subir CON esta barra. Si
     * sube solo una, el último renglón de cada pantalla queda tapado.
     *
     * ⚠️ `pointer-events-none` en la franja y `auto` en la píldora: al flotar,
     * la franja cruza la pantalla entera y sin esto se tragaría los toques del
     * contenido que se ve a sus lados.
     */
    <nav
      aria-label="Principal"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(0.75rem+var(--safe-bottom))] z-30 flex justify-center px-6"
    >
      {/*
        ⚠️ Ancha, pero con aire a los lados. El `max-w` la frena en las
        pantallas grandes --de lo contrario, en una tableta la píldora cruzaría
        30 cm con cinco cosas dentro-- y el `px-6` del padre le deja el margen
        en un teléfono, donde manda el ancho de la pantalla y no el tope.
      */}
      <div className="pointer-events-auto flex w-full max-w-88 items-center gap-1 rounded-full border border-line bg-card/85 p-1.5 shadow-[0_8px_28px_rgb(0_0_0/0.18)] backdrop-blur-xl">
        {destino(homeHref, "Mi día", Home, enPortada)}
        {destino("/conteos", "Conteos", Boxes, conteosActivo)}

        {/*
          La ACCIÓN. Va en el extremo del neutro --tinta sobre papel, papel
          sobre tinta en oscuro-- y no en color: es la misma regla que la acción
          principal de «Mi día», y lo que mantiene una sola cosa gritando por
          pantalla.

          ⚠️ Estando encendido NO puede marcarse como los demás: ya es un
          círculo relleno, así que otro relleno encima no se vería. Lo marca un
          aro exterior, que es lo único que le queda libre.
        */}
        <Link
          href={ESCANEAR_HREF}
          onClick={() => { if (!escanearActivo) haptic("medium"); }}
          aria-current={escanearActivo ? "page" : undefined}
          aria-label="Escanear un marbete"
          className={cn(
            "tappable mx-1 grid size-11 shrink-0 place-items-center rounded-full bg-ink text-card",
            escanearActivo && "ring-2 ring-ink/25 ring-offset-2 ring-offset-card",
            !reduce && "transition-transform active:scale-95"
          )}
        >
          <ScanLine size={21} />
        </Link>

        {puedeKpis ? destino("/kpis", "KPIs", BarChart3, kpisActivo) : null}
        {destino("/todo", "Todo", LayoutGrid, todoActivo)}
      </div>
    </nav>
  );
}

