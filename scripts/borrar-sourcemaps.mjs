import { readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";

/**
 * Borra los source maps del cliente DESPUÉS de construir y subirlos.
 *
 * ⚠️ **Un source map servido es el código fuente entero a la vista de
 * cualquiera.** Lo único que hace falta para leerlo es abrir las herramientas
 * del navegador: nombres de funciones, lógica de comisiones, cómo se firma la
 * petición del aparato, todo. Y no deja ningún rastro de que alguien lo miró.
 *
 * Esto existe porque para simbolizar hay que GENERARLOS, y Next los escribe
 * dentro de `.next/static`, que es exactamente la carpeta que se publica. El
 * plugin de Sentry los borraba solo; al sustituirlo por el de Faro esa
 * limpieza deja de ocurrir sola, y sin este paso el cambio de proveedor
 * expondría el código sin que nadie lo hubiera decidido.
 *
 * ⚠️ Se borran SOLO los de `static`, que son los que se sirven al navegador.
 * Los de `server` no salen de la máquina y ayudan a leer una traza del
 * servidor.
 */

const RAIZ = join(process.cwd(), ".next", "static");

async function borrar(dir) {
  let entradas;
  try {
    entradas = await readdir(dir);
  } catch {
    // Sin carpeta no hay nada que borrar: un build que no llegó a generarla.
    return 0;
  }

  let contados = 0;
  for (const entrada of entradas) {
    const ruta = join(dir, entrada);
    const info = await stat(ruta);
    if (info.isDirectory()) {
      contados += await borrar(ruta);
    } else if (entrada.endsWith(".map")) {
      await rm(ruta);
      contados += 1;
    }
  }
  return contados;
}

const borrados = await borrar(RAIZ);
console.log(`[sourcemaps] ${borrados} borrados de .next/static`);

/*
 * ⚠️ Comprobación, no confianza. Si quedara alguno, el build FALLA en vez de
 * publicar el código fuente. Un `rm` que falla en silencio y un `rm` que
 * funciona se ven idénticos desde fuera, y aquí la diferencia es el código de
 * la app en internet.
 */
const restantes = await borrar(RAIZ);
if (restantes > 0) {
  console.error(`[sourcemaps] quedan ${restantes} sin borrar: NO se publica`);
  process.exit(1);
}
