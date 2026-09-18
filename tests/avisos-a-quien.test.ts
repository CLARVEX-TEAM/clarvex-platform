import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
