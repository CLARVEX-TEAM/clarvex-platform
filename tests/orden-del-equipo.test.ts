import assert from "node:assert/strict";
import test from "node:test";
import { ordenDelEquipo } from "../lib/weekly-close";

/*
 * ⚠️ Esto ordena COLUMNAS de Cuota Justa y del RDS, que van a corporativo y
 * alimentan el cálculo de comisiones. Un orden que cambie de una exportación a
 * otra mueve a la gente de columna sin que nadie lo note.
 */

const EQUIPO = [
  { id: "itzel", role: "GERENTE" as const, employeeNumber: "81893" },
  { id: "adrian", role: "SUBGERENTE" as const, employeeNumber: "102259" },
  { id: "alonso", role: "ASESOR" as const, employeeNumber: "113642" },
  { id: "waira", role: "ASESOR" as const, employeeNumber: "95739" },
  { id: "jazmin", role: "ASESOR" as const, employeeNumber: "96383" }
];

const enOrden = (gente: typeof EQUIPO) =>
  [...ordenDelEquipo(gente).entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id);

test("⚠️ el numero de empleado se compara como NUMERO, no como texto", () => {
  /*
   * `employeeNumber` es una cadena. Ordenada tal cual, «113642» va antes que
   * «95739» porque empieza por uno, y Alonso saldria primero --que es justo el
   * orden equivocado que esto viene a arreglar.
   */
  assert.deepEqual(enOrden(EQUIPO), ["itzel", "adrian", "waira", "jazmin", "alonso"]);
});

test("el puesto manda sobre el numero", () => {
  // Itzel (81893) tiene el numero mas bajo del equipo y aun asi va primera por
  // gerente; si el numero mandara, el orden de puestos se rompería.
  const revuelto = [EQUIPO[2], EQUIPO[4], EQUIPO[0], EQUIPO[3], EQUIPO[1]];
  assert.deepEqual(enOrden(revuelto), ["itzel", "adrian", "waira", "jazmin", "alonso"]);
});

test("un numero que no es numero va al FINAL, no al principio", () => {
  // Un `NaN` en la comparación deja el orden indefinido: peor que ponerlo último.
  const conBasura = [...EQUIPO, { id: "raro", role: "ASESOR" as const, employeeNumber: "SIN-NUMERO" }];
  assert.equal(enOrden(conBasura).at(-1), "raro");
});

test("el orden no cambia entre llamadas con la misma gente", () => {
  // Un orden inestable movería a la gente de columna entre exportaciones.
  assert.deepEqual(enOrden(EQUIPO), enOrden([...EQUIPO].reverse()));
});
