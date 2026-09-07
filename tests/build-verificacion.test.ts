import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

/*
 * Por qué existen estas pruebas.
 *
 * El build de produccion se salta lint y comprobacion de tipos --19 s de cada
 * 64, casi un tercio-- porque son trabajo REPETIDO: el preflight del despliegue
 * exige CI verde del MISMO SHA, y esa CI ya corrio `tsc --noEmit` y
 * `eslint . --max-warnings 0` enteros.
 *
 * ⚠️ Eso apaga una red de seguridad, y solo es legitimo mientras se cumplan DOS
 * cosas. Estas pruebas vigilan las dos, porque si alguna cae el fallo es mudo:
 * un error de tipos llegaria a produccion y el build seguiria en verde.
 *
 *   1. Por defecto NO se salta nada. Solo con la bandera.
 *   2. La bandera la pone unicamente el guion de despliegue, que es el unico
 *      camino que trae la garantia de la CI.
 */

const CONFIG = readFileSync("next.config.mjs", "utf8");
const DESPLIEGUE = readFileSync("scripts/deploy-release.sh", "utf8");
const BANDERA = "CLARVEX_CI_VERIFICADA";

test("por defecto, el build SI comprueba tipos y lint", async () => {
  delete process.env[BANDERA];
  const config = (await import(`../next.config.mjs?sin-bandera-${Date.now()}`)).default;
  assert.equal(config.typescript?.ignoreBuildErrors, false, "sin la bandera, los errores de tipos tienen que romper el build");
  assert.equal(config.eslint?.ignoreDuringBuilds, false, "sin la bandera, ESLint tiene que correr");
});

test("con la bandera se salta, que es lo que hace rapido el despliegue", async () => {
  process.env[BANDERA] = "1";
  try {
    const config = (await import(`../next.config.mjs?con-bandera-${Date.now()}`)).default;
    assert.equal(config.typescript?.ignoreBuildErrors, true);
    assert.equal(config.eslint?.ignoreDuringBuilds, true);
  } finally {
    delete process.env[BANDERA];
  }
});

test("solo se salta con el valor exacto, no con cualquier cosa", async () => {
  // Un "0", un "false" o un "" no pueden activarlo por accidente.
  for (const valor of ["0", "false", "", "no", "true"]) {
    process.env[BANDERA] = valor;
    try {
      const config = (await import(`../next.config.mjs?v-${valor}-${Date.now()}`)).default;
      const esperado = valor === "1";
      assert.equal(config.typescript?.ignoreBuildErrors, esperado, `con ${BANDERA}="${valor}"`);
    } finally {
      delete process.env[BANDERA];
    }
  }
});

test("la bandera la pone el guion de despliegue y nadie mas", () => {
  // ⚠️ Si algun dia se moviera a un `.env`, al `package.json` o al Dockerfile,
  // se aplicaria a builds que NO pasaron por el preflight de la CI. Ahi la
  // justificacion entera se cae, y en silencio.
  assert.match(DESPLIEGUE, new RegExp(`export ${BANDERA}=1`), "deploy-release.sh tiene que ser quien la exporte");
  assert.ok(CONFIG.includes(BANDERA), "next.config.mjs tiene que leerla");
});

test("el despliegue sigue exigiendo CI verde del mismo SHA", () => {
  // Es la premisa completa: sin esta garantia, saltarse los tipos deja de tener
  // defensa. Si alguien retira el preflight, esta prueba lo dice.
  const flujo = readFileSync(".github/workflows/deploy.yml", "utf8");
  assert.match(flujo, /head_sha/, "el preflight tiene que buscar la CI por el SHA exacto");
  assert.match(flujo, /conclusion.*success|success.*conclusion/s, "y exigir que haya terminado bien");
});
