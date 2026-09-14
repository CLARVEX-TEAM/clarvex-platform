import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

/*
 * Por qué existen estas pruebas.
 *
 * ⚠️ **Los flujos de n8n se versionan aquí y NADA los comprobaba.** Son JSON con
 * JavaScript dentro de una cadena, así que ni TypeScript ni ESLint los miran:
 * para las puertas de calidad son texto.
 *
 * El 14 de septiembre de 2026 edité un nodo con cirugía de cadenas y dejé un
 * `];` de más. El archivo seguía siendo JSON válido, `pnpm test` y el build
 * pasaban en verde, y el error solo habría aparecido **al mandar una foto al
 * bot**, con la tienda esperando respuesta y nadie mirando las ejecuciones de
 * n8n. Se descubrió por casualidad.
 *
 * ⚠️ Y el fallo no habría dado la cara donde se causó: entre editar el flujo y
 * ejecutarlo hay un import, un publish y un reinicio del contenedor. La primera
 * sospecha habría sido la importación, no el paréntesis.
 *
 * Esto no valida la LÓGICA de los flujos --para eso hay que ejecutarlos-- sino
 * que lo versionado se puede ejecutar siquiera.
 */

const CARPETA = path.join(__dirname, "..", "scripts");

/*
 * n8n ejecuta el código de un nodo como función ASÍNCRONA: varios usan `await`
 * --`getBinaryDataBuffer`, por ejemplo--. Compilarlo con `Function` a secas da
 * un fallo falso («await is only valid in async functions») que no es del
 * código y manda a buscar donde no hay nada.
 */
const FuncionAsincrona = Object.getPrototypeOf(async function () {}).constructor as FunctionConstructor;

type Nodo = { name?: string; type?: string; parameters?: Record<string, unknown> };

function flujosVersionados(): Array<{ archivo: string; nodos: Nodo[] }> {
  return readdirSync(CARPETA)
    .filter((f) => f.startsWith("n8n-") && f.endsWith(".json"))
    .map((archivo) => {
      const crudo = JSON.parse(readFileSync(path.join(CARPETA, archivo), "utf8")) as unknown;
      // Unos se exportan como objeto y otros dentro de un arreglo.
      const flujos = Array.isArray(crudo) ? crudo : [crudo];
      const nodos = flujos.flatMap((f) => ((f as { nodes?: Nodo[] }).nodes ?? []));
      return { archivo, nodos };
    });
}

test("hay flujos versionados que revisar", () => {
  const flujos = flujosVersionados();
  assert.ok(flujos.length > 0, "no se encontró ningún scripts/n8n-*.json");
  // Sin nodos de código, la prueba de abajo pasaría sin comprobar nada.
  const conCodigo = flujos.reduce(
    (n, f) => n + f.nodos.filter((x) => x.type === "n8n-nodes-base.code").length,
    0
  );
  assert.ok(conCodigo > 0, "ningún flujo tiene nodos de código: la revisión no estaría mirando nada");
});

test("el JavaScript de cada nodo de código compila", () => {
  const rotos: string[] = [];

  for (const { archivo, nodos } of flujosVersionados()) {
    for (const nodo of nodos) {
      if (nodo.type !== "n8n-nodes-base.code") continue;
      const codigo = nodo.parameters?.jsCode;
      if (typeof codigo !== "string") continue;
      try {
        // Los nombres que n8n deja en el ámbito del nodo.
        new FuncionAsincrona("$", "$json", "$input", "$env", codigo);
      } catch (error) {
        rotos.push(`${archivo} › ${nodo.name ?? "(sin nombre)"}: ${(error as Error).message}`);
      }
    }
  }

  assert.deepEqual(rotos, [], `Nodos con JavaScript inválido:\n${rotos.join("\n")}`);
});

test("las expresiones de los nodos que no son de código están bien formadas", () => {
  /*
   * Una expresión de n8n va como `={{ ... }}`. No se puede compilar aparte
   * --usa `$json`, `$env` y ayudantes suyos-- pero sí se puede comprobar que
   * las llaves cierren: `={{ $json.x }` se queda como texto literal y el nodo
   * manda la cadena cruda, sin dar error.
   */
  const malas: string[] = [];

  for (const { archivo, nodos } of flujosVersionados()) {
    for (const nodo of nodos) {
      if (nodo.type === "n8n-nodes-base.code") continue;
      const texto = JSON.stringify(nodo.parameters ?? {});
      for (const trozo of texto.match(/"=[^"]*"/g) ?? []) {
        const abre = (trozo.match(/\{\{/g) ?? []).length;
        const cierra = (trozo.match(/\}\}/g) ?? []).length;
        if (abre !== cierra) {
          malas.push(`${archivo} › ${nodo.name ?? "(sin nombre)"}: ${abre} «{{» y ${cierra} «}}»`);
        }
      }
    }
  }

  assert.deepEqual(malas, [], `Expresiones con llaves sin cerrar:\n${malas.join("\n")}`);
});
