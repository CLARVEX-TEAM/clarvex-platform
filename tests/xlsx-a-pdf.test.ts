import assert from "node:assert/strict";
import test from "node:test";
import { ConversionPdfNoDisponible, convertirXlsxAPdf } from "../lib/xlsx-a-pdf";

/**
 * ⚠️ **Estas pruebas NO ejecutan LibreOffice.** No lo hay en la máquina de
 * desarrollo ni en el runner de CI, y montarlo solo para esto costaría minutos
 * en cada ejecución. Lo que se comprueba es lo único que puede fallar en
 * silencio: que un entorno SIN LibreOffice, o una conversión que no sale bien,
 * se distingan y avisen — porque de eso depende que la ruta de exportación caiga
 * al trazado de respaldo en vez de servir un archivo roto.
 *
 * Que la conversión sea fiel al formato corporativo se comprobó a mano contra el
 * servidor, comparando el resultado con los PDF reales de la tienda.
 */

function conBinario<T>(valor: string, run: () => Promise<T>): Promise<T> {
  const previo = process.env.SOFFICE_BIN;
  process.env.SOFFICE_BIN = valor;
  return run().finally(() => {
    if (previo === undefined) delete process.env.SOFFICE_BIN;
    else process.env.SOFFICE_BIN = previo;
  });
}

test("⚠️ sin LibreOffice instalado avisa, y no devuelve un archivo cualquiera", async () => {
  // Es el caso del desarrollo y el de un servidor sin aprovisionar. La ruta de
  // exportación lo trata como «usa el trazado de respaldo».
  await conBinario("soffice-que-no-existe-en-ninguna-parte", async () => {
    await assert.rejects(
      () => convertirXlsxAPdf(Buffer.from("PK no importa el contenido")),
      (error: unknown) => {
        assert.ok(error instanceof ConversionPdfNoDisponible, `tipo inesperado: ${String(error)}`);
        assert.match(error.message, /no se encontró/);
        return true;
      }
    );
  });
});

test("⚠️ un conversor que falla se reporta, no se sirve como PDF", async () => {
  /*
   * Se lanza el propio Node con los argumentos de LibreOffice: no los entiende
   * y sale distinto de cero, que es el camino de «la conversión no salió».
   *
   * ⚠️ El módulo comprueba además la CABECERA `%PDF`, porque LibreOffice puede
   * salir en 0 y dejar un fichero vacío o un mensaje de error. Ese caso no se
   * cubre aquí --haría falta un binario de mentira, y en Windows Node bloquea
   * lanzar `.cmd` sin shell desde CVE-2024-27980-- pero la comprobación se
   * conserva en el código: servir un PDF que no abre es peor que el respaldo,
   * que al menos se ve.
   */
  await conBinario(process.execPath, async () => {
    await assert.rejects(
      () => convertirXlsxAPdf(Buffer.from("PK")),
      (error: unknown) => {
        assert.ok(error instanceof ConversionPdfNoDisponible, `tipo inesperado: ${String(error)}`);
        assert.match(error.message, /salió con código|sin dejar el PDF/);
        return true;
      }
    );
  });
});

test("⚠️ la variable del binario se lee en cada llamada, no al importar", async () => {
  /*
   * Estaba como constante de módulo y quedaba congelada en el primer `import`:
   * cambiar `SOFFICE_BIN` no tenía efecto y la prueba de arriba pasaba mirando
   * el binario por omisión, no el que ella misma había puesto.
   */
  const primero = await conBinario("primer-binario-inexistente", () =>
    convertirXlsxAPdf(Buffer.from("PK")).then(() => "", (error: Error) => error.message));
  const segundo = await conBinario("segundo-binario-inexistente", () =>
    convertirXlsxAPdf(Buffer.from("PK")).then(() => "", (error: Error) => error.message));

  assert.match(primero, /primer-binario-inexistente/);
  assert.match(segundo, /segundo-binario-inexistente/);
});
