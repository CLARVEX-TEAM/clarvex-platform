import assert from "node:assert/strict";
import test from "node:test";

import { nombreCorto, reporteDeVenta } from "@/lib/reporte-finde";

/*
 * Por qué existen estas pruebas: el bloque se copia y se pega tal cual en el
 * grupo de la plaza, así que tiene que salir IGUAL al formato que pidieron.
 * Las cifras son las del 7 nov 2026 en San Agustín, contra el ejemplo de Adrián.
 */

test("sale idéntico al ejemplo de la plaza", () => {
  const bloque = reporteDeVenta({ tienda: "TH SAN AGUSTIN", meta: 44194.49, venta: 25756.99, tickets: 12, trafico: 78 });
  assert.equal(bloque, ["San Agustin", "Meta:$44,194.49", "Mínimo:$38,429.99", "Venta:$25,756.99", "Alcance:58", "TC:15%"].join("\n"));
});

test("sin tráfico ni meta no divide entre cero", () => {
  const bloque = reporteDeVenta({ tienda: "TH SAN AGUSTIN", meta: 0, venta: 0, tickets: 0, trafico: 0 });
  assert.match(bloque, /Alcance:0\nTC:0%$/);
});

test("el nombre de la tienda va sin la marca y en tipo título", () => {
  assert.equal(nombreCorto("TH SAN AGUSTIN"), "San Agustin");
  assert.equal(nombreCorto("GUESS GALERIAS MONTERREY"), "Guess Galerias Monterrey");
});
