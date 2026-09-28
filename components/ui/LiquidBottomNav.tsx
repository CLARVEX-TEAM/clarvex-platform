"use client";

import { useEffect, useState } from "react";
import { BarraTelefonoApk, NAV_APK } from "@/components/ui/BarraTelefonoApk";
import { BarraTelefonoWeb, NAV_WEB } from "@/components/ui/BarraTelefonoWeb";
import { enContenedorNativo } from "@/lib/puente-nativo";

/**
 * Quién pinta la barra de abajo.
 *
 * ⚠️ **El rediseño de septiembre de 2026 es exclusivo de la APK**, por decisión
 * del usuario: píldora flotante con cuatro destinos y una acción, elegidos
 * midiendo la base. El navegador, el iPhone y la PWA conservan la barra de seis
 * pestañas EXACTAMENTE como estaba.
 *
 * Por eso son dos archivos y no un montón de condicionales dentro de uno: con
 * las dos barras entrelazadas, cualquier retoque al diseño nuevo se le cuela
 * sin querer a la web, que es justo lo que esta separación impide.
 */

// Lo que mira `tests/accesos-telefono.test.ts`: la UNIÓN de las dos barras.
//
// ⚠️ Tiene que ser la unión, no una de las dos. La prueba comprueba que ninguna
// pantalla del teléfono se quede sin puerta, y una pantalla a la que solo se
// llega desde la APK --o solo desde la web-- SÍ tiene puerta. Mirando una sola
// lista, la prueba fallaría por pantallas que están bien, y el arreglo sería
// agregar entradas falsas: una prueba que empuja a mentirle es peor que ninguna.
export const navItems = [...NAV_APK, ...NAV_WEB];

export function LiquidBottomNav() {
  /*
   * `null` = todavía no se sabe dónde estamos.
   *
   * ⚠️ **No se puede decidir durante el render.** `enContenedorNativo()` mira
   * el agente del navegador, que solo existe en el cliente: el servidor pintaría
   * una barra y el cliente otra, y eso es un fallo de hidratación --el mismo que
   * ya deja trazas en la consola en otra pantalla--. Se decide en un efecto y
   * hasta entonces no se pinta nada.
   *
   * Esperar no cuesta: las dos barras ya esperaban a la sesión antes de
   * aparecer, porque el celular kiosko no debe verlas.
   *
   * ⚠️ Y esto SÍ se puede preguntar al arrancar, al contrario que un plugin.
   * `enContenedorNativo()` compara el prefijo `ClarvexApp/` del agente, que el
   * WebView fija ANTES de cargar nada; `isPluginAvailable` es otra pregunta
   * distinta y esa sí llega tarde. Confundirlas es lo que costó el candado de
   * la huella.
   */
  const [enApk, setEnApk] = useState<boolean | null>(null);

  useEffect(() => { setEnApk(enContenedorNativo()); }, []);

  if (enApk === null) return null;
  return enApk ? <BarraTelefonoApk /> : <BarraTelefonoWeb />;
}

export const BottomNav = LiquidBottomNav;
