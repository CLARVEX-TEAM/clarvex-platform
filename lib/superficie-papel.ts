"use client";

import { useSyncExternalStore } from "react";

/**
 * ¿Esta pantalla se está pintando en la superficie «papel», o sea dentro de la
 * APK?
 *
 * ⚠️ **Existe porque acotar el CSS no bastó.** El rediseño de septiembre de 2026
 * no solo cambió colores: en Bitácora, Checklist y Pendientes cambió el MARCADO
 * --el formulario que nace cerrado tras un botón flotante, la lista en una sola
 * tarjeta, las pastillas en vez de un `<select>`--. Eso no se puede esconder con
 * una regla bajo `[data-surface="papel"]`: fuera de la APK quedaría la
 * estructura nueva sin su estilo, que se ve roto y no «como antes».
 *
 * ⚠️ **Lee el ATRIBUTO que pone `app/layout.tsx`, no el agente.** Así hay una
 * sola regla de qué es papel --la del guion en línea--, y esta pantalla no puede
 * decidir una cosa mientras el CSS decide otra.
 *
 * ⚠️ **En el servidor y durante la hidratación contesta `false`.** El atributo
 * lo pone el DOM antes de React, y el servidor no lo ve; contestar otra cosa ahí
 * rompería la hidratación. `useSyncExternalStore` hidrata con el valor del
 * servidor y repinta enseguida con el del documento. Las tres pantallas pintan
 * un esqueleto hasta tener datos, así que en la APK ese primer pintado no se ve.
 *
 * No se suscribe a nada: el atributo se pone una vez por documento y no cambia.
 */
export function useSuperficiePapel(): boolean {
  return useSyncExternalStore(sinSuscripcion, esPapel, () => false);
}

function sinSuscripcion(): () => void {
  return () => {};
}

function esPapel(): boolean {
  return document.documentElement.dataset.surface === "papel";
}
