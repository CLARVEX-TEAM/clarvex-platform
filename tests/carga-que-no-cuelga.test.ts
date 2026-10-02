import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import test from "node:test";

/*
 * Una pantalla que no puede traer sus datos tiene que DECIRLO.
 *
 * ⚠️ Cuatro pantallas de Conteos pedían sus datos con un `fetch` sin `catch`.
 * Al fallar, el estado se quedaba en `null`, el render entraba por la rama de
 * «Cargando…» y ahí se quedaba PARA SIEMPRE: sin mensaje, sin botón y sin nada
 * que volviera a intentarlo. Desde fuera es idéntico a una carga lenta, así que
 * la persona espera. Con la señal del centro comercial cayéndose a diario, ese
 * estado no era raro.
 *
 * ⚠️ Lo encontró la auditoría del 2 de octubre de 2026 leyendo el código, no
 * una prueba: ninguna lo cubría. Y es la MISMA lección que este proyecto ya
 * había escrito para `getSession()` --ver `lib/use-session.ts`--, que nunca
 * llegó a estos componentes. La pregunta no es «¿está arreglado este camino?»
 * sino «¿queda algún camino abierto?».
 *
 * Esta prueba comprueba el PATRÓN: cualquier pantalla que espere datos y no
 * tenga con qué atrapar el fallo falla NOMBRANDO su archivo.
 */

const RAIZ = join(__dirname, "..");

/** Lo que señala que la pantalla se queda esperando algo. */
const ESPERA = /Cargando…|Generando códigos…/;
/** Lo que señala que sabe qué hacer si no llega. */
const SABE_FALLAR = /\bcatch\b|useCargaConReintento/;

function archivos(dir: string, salida: string[] = []): string[] {
  for (const entrada of readdirSync(dir)) {
    if (entrada === "node_modules" || entrada === ".next" || entrada.startsWith(".")) continue;
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) archivos(ruta, salida);
    else if (entrada.endsWith(".tsx")) salida.push(ruta);
  }
  return salida;
}

function cuelgan(): string[] {
  const out: string[] = [];
  for (const carpeta of ["app", "components"]) {
    for (const ruta of archivos(join(RAIZ, carpeta))) {
      const codigo = readFileSync(ruta, "utf8");
      if (!codigo.includes("await fetch(")) continue;
      if (!ESPERA.test(codigo)) continue;
      if (SABE_FALLAR.test(codigo)) continue;
      out.push(relative(RAIZ, ruta).split(sep).join("/"));
    }
  }
  return out.sort();
}

test("⚠️ ninguna pantalla se queda esperando sin saber fallar", () => {
  const sueltas = cuelgan();
  assert.deepEqual(
    sueltas,
    [],
    "estas pantallas piden datos, enseñan un «Cargando…» y no tienen forma de atrapar el fallo: " +
      "si la petición revienta se quedan ahí para siempre. Envuelve la carga con " +
      `useCargaConReintento (lib/use-carga.ts) o atrápala: ${sueltas.join(" | ")}`
  );
});

test("⚠️ el reintento va por EVENTO, nunca por temporizador", () => {
  /*
   * Insistir cada X segundos gasta batería sin ninguna señal de que algo haya
   * cambiado, y estas pantallas viven en el teléfono de la tienda toda la
   * jornada. Las dos señales son las mismas que usan `useSession` y `useAppData`.
   */
  const hook = readFileSync(join(RAIZ, "lib", "use-carga.ts"), "utf8");
  assert.match(hook, /visibilitychange/, "falta reintentar al volver a la app");
  assert.match(hook, /clarvex-online/, "falta reintentar al recuperar la señal");
  assert.doesNotMatch(hook, /setInterval|setTimeout/, "el reintento no puede ser por temporizador");
});

test("⚠️ escucha SOLO mientras ha fallado", () => {
  // Si no, cada vez que alguien saca el teléfono del bolsillo se dispara una
  // petición más, que no es lo que este arreglo viene a hacer.
  const hook = readFileSync(join(RAIZ, "lib", "use-carga.ts"), "utf8");
  assert.match(hook, /if \(!activo \|\| !fallo\) return;/);
});

test("⚠️ `clarvex-online` lo emite alguien de verdad", () => {
  /*
   * Es un evento propio, no del navegador: si nadie lo dispara, la mitad del
   * reintento es código muerto y nadie se entera. Lo emite `OfflineBanner`, que
   * va montado en el layout raíz.
   *
   * Y es propio a propósito: en Android el evento `online` del navegador puede
   * no llegar NUNCA. Lo documenta `lib/conexion.ts`.
   */
  const banner = readFileSync(join(RAIZ, "components", "OfflineBanner.tsx"), "utf8");
  assert.match(banner, /dispatchEvent\(new Event\("clarvex-online"\)\)/);
  const layout = readFileSync(join(RAIZ, "app", "layout.tsx"), "utf8");
  assert.match(layout, /<OfflineBanner \/>/);
});
