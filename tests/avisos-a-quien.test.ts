import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { ADVISOR_WHERE, NOTIFIABLE_WHERE, PERSON_WHERE, isRealPerson } from "../lib/store-people";

/*
 * Por qué existen estas pruebas.
 *
 * ⚠️ **El 18 de septiembre de 2026 el recordatorio de turno mandó sus tres
 * primeros avisos de la vida a la tienda DEMO.** Sofía Ramírez, Valeria Cruz y
 * Mateo Luna, de «Boutique Aurora (Demo)» — cuentas públicas y compartidas que
 * usa cualquiera que entre a mirar el producto. El equipo real de la tienda no
 * recibió nada.
 *
 * El filtro decía `active: true`, que es verdad y no es suficiente: deja pasar
 * al aparato de la tienda y a las cuentas de demostración. `PERSON_WHERE` tapa
 * lo primero y no lo segundo.
 *
 * ⚠️ **Honestidad sobre lo que esto prueba y lo que no.** Comprobar una cláusula
 * de Prisma dentro de la propia prueba solo demostraría que Postgres sabe
 * filtrar, que no está en duda —es la lección que este repositorio ya se llevó
 * con las pruebas de aislamiento—. Lo que se comprueba aquí es la FORMA del
 * filtro y que el cron lo use; que la consulta filtre de verdad lo cubre la
 * suite de integración contra PostgreSQL.
 */

test("el filtro de avisos deja fuera al kiosko Y a las cuentas demo", () => {
  assert.equal(NOTIFIABLE_WHERE.active, true);
  assert.equal(NOTIFIABLE_WHERE.checklistOnly, false, "el aparato de la tienda no recibe avisos");
  assert.equal(NOTIFIABLE_WHERE.isDemo, false, "las cuentas de demostración tampoco");
});

test("los filtros de siempre no cambian de significado", () => {
  // `PERSON_WHERE` y `ADVISOR_WHERE` los usan consultas de operación --plantilla
  // de asistencia, resúmenes-- donde las cuentas demo SÍ deben verse dentro de
  // su propia tienda. Ampliarlos de más rompería la demo.
  assert.deepEqual(PERSON_WHERE, { active: true, checklistOnly: false });
  assert.equal(ADVISOR_WHERE.role, "ASESOR");
  assert.equal(ADVISOR_WHERE.checklistOnly, false);
  assert.equal("isDemo" in PERSON_WHERE, false, "PERSON_WHERE no filtra demo, y es a propósito");
});

test("el cron del recordatorio usa el filtro de avisos, no `active` a secas", () => {
  /*
   * Esto mira el CÓDIGO FUENTE. No demuestra que la consulta filtre —eso es de
   * integración— pero sí que nadie deshaga el arreglo sin enterarse, que es
   * justo lo que pasó: el filtro corto se veía razonable.
   */
  const ruta = path.join(__dirname, "..", "app", "api", "cron", "shift-reminder", "route.ts");
  const fuente = readFileSync(ruta, "utf8");
  assert.match(fuente, /user:\s*NOTIFIABLE_WHERE/, "el cron tiene que filtrar con NOTIFIABLE_WHERE");
  assert.equal(/user:\s*\{\s*active:\s*true\s*\}/.test(fuente), false, "el filtro corto dejaba pasar demo y kiosko");
});

test("isRealPerson sigue siendo sobre el aparato, no sobre la demo", () => {
  assert.equal(isRealPerson({ active: true, checklistOnly: false }), true);
  assert.equal(isRealPerson({ active: true, checklistOnly: true }), false);
  assert.equal(isRealPerson({ active: false }), false);
});

test("ningun cron avisa a una persona dada de BAJA", () => {
  /*
   * ⚠️ Dos se habían quedado sin `active: true`: `pending-overdue-managers` y
   * `week-goal-alert`. El día que se dé de baja a un gerente, seguiría
   * recibiendo los avisos de su tienda — y una baja no se entera de que los
   * recibe de más, así que nadie lo reporta.
   *
   * Cuando se encontró, los siete gerentes estaban activos: el fallo era real y
   * su daño, cero. Es la clase de cosa que solo se ve buscándola.
   *
   * Mira el código fuente. No prueba que Postgres filtre; prueba que nadie
   * quite el filtro sin enterarse.
   */
  const carpeta = path.join(__dirname, "..", "app", "api", "cron");
  const conGerencia = readdirSync(carpeta).filter((n) => {
    const ruta = path.join(carpeta, n, "route.ts");
    return existsSync(ruta) && /GERENTE/.test(readFileSync(ruta, "utf8"));
  });

  assert.ok(conGerencia.length >= 5, "esperaba varios crons que avisen a gerencia");

  /*
   * ⚠️ Se mira una VENTANA de texto alrededor de cada «SUBGERENTE», no un
   * regex de llaves balanceadas: eso no se puede con expresiones regulares y el
   * primer intento dio cuatro falsos positivos --cortaba la llave en el
   * `{ in: [...] }` del propio rol--. Un vigilante que grita sin motivo se
   * ignora, y entonces no sirve de nada.
   */
  const sinFiltro: string[] = [];
  for (const nombre of conGerencia) {
    const fuente = readFileSync(path.join(carpeta, nombre, "route.ts"), "utf8");
    let desde = 0;
    for (;;) {
      const donde = fuente.indexOf("SUBGERENTE", desde);
      if (donde === -1) break;
      desde = donde + 1;
      const ventana = fuente.slice(Math.max(0, donde - 260), donde + 260);
      // Solo interesan las consultas de USUARIOS; hay otros usos del rol.
      if (!/user.findMany|users.findMany/.test(ventana)) continue;
      if (/active:\s*true/.test(ventana)) continue;
      if (/NOTIFIABLE_WHERE|PERSON_WHERE|ADVISOR_WHERE/.test(ventana)) continue;
      sinFiltro.push(nombre);
    }
  }

  assert.deepEqual(sinFiltro, [], `Estos crons avisarían a una persona dada de baja:\n${sinFiltro.join("\n")}`);
});
