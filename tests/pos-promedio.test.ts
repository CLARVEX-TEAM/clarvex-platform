import assert from "node:assert/strict";
import test from "node:test";
import { posCaptureRows, promedioProblemas, type PosPromedio, type PosRow } from "../lib/pos-productivity";

/*
 * Los CINCO reportes reales de TH SAN AGUSTIN, transcritos de las capturas del
 * visor del POS: 4, 5, 6, 7 y 9 de septiembre de 2026.
 *
 * ⚠️ **La fila «Promedio» es la unica comprobacion que mira el reporte ENTERO.**
 * Las cuatro cuentas de `rowProblems` viven todas dentro de cada fila, asi que
 * una fila que el lector no vio las pasa todas --las que quedan cuadran solas--
 * y el dia se captura de menos sin que nada lo delate. Esta media lo caza
 * porque depende de CUANTAS filas hay.
 *
 * Durante meses se tiro a la basura: el prompt decia «NO incluyas la fila
 * Promedio».
 */

const fila = (
  name: string,
  tickets: number,
  units: number,
  unitsReturned: number,
  gross: number,
  discount: number,
  afterDiscount: number,
  returns: number,
  net: number,
  avgUnits: number,
  avgAmount: number
): PosRow => ({ name, tickets, units, unitsReturned, gross, discount, afterDiscount, returns, net, avgUnits, avgAmount });

const prom = (
  tickets: number,
  units: number,
  gross: number,
  afterDiscount: number,
  net: number,
  avgUnits: number,
  avgAmount: number
): PosPromedio => ({ tickets, units, gross, afterDiscount, net, avgUnits, avgAmount });

const REPORTES: Array<{ dia: string; filas: PosRow[]; promedio: PosPromedio }> = [
  {
    dia: "2026-09-04",
    filas: [
      fila("CASTRO, JAZMIN", 2, 2, 0, 2998, 1199.2, 1798.8, 0, 1798.8, 1.0, 899.4),
      fila("POPOCA, WAIRA ZITLAL", 2, 4, 0, 8896, 0, 8896, 0, 8896, 2.0, 4448),
      fila("REYES, ITZEL SAIDY", 1, 1, 0, 2499, 0, 2499, 0, 2499, 1.0, 2499),
      // ⚠️ Trevino: una devolucion. Unidades Dev. -1 y Bruto Devoluciones -999.
      fila("TREVIÃO, EDUARDO AL", 3, 2, 1, 1998, 399.6, 1598.4, 999, 599.4, 0.33, 199.8)
    ],
    promedio: prom(2, 2, 4097.75, 3698.05, 3448.3, 1.08, 2011.55)
  },
  {
    dia: "2026-09-05",
    filas: [
      fila("CASTRO, JAZMIN", 5, 11, 0, 18229, 3238.8, 14990.2, 0, 14990.2, 2.2, 2998.04),
      fila("POPOCA, WAIRA ZITLAL", 6, 8, 0, 11892, 2798, 9094, 0, 9094, 1.33, 1515.67),
      fila("REYES, ITZEL SAIDY", 1, 1, 0, 999, 399.6, 599.4, 0, 599.4, 1.0, 599.4),
      fila("TREVIÃO, EDUARDO AL", 4, 6, 0, 14094, 3158.8, 10935.2, 0, 10935.2, 1.5, 2733.8)
    ],
    // ⚠️ Media de unidades 6.5 y el reporte imprime 7: los ENTEROS se redondean.
    promedio: prom(4, 7, 11303.5, 8904.7, 8904.7, 1.51, 1961.73)
  },
  {
    dia: "2026-09-06",
    filas: [
      fila("CASTRO, JAZMIN", 13, 21, 0, 40949, 13234, 27715, 0, 27715, 1.62, 2131.92),
      // ⚠️ Waira: ese domingo estaba de DESCANSO y aun asi tiene venta y una
      // devolucion. Su fila es legitima --la mercancia salio-- y pasa las cuatro
      // cuentas. Que aparezca sin haber trabajado no es un error del lector.
      fila("POPOCA, WAIRA ZITLAL", 2, 2, 1, 1998, 799.2, 1198.8, 999, 199.8, 0.5, 99.9),
      fila("REYES, ITZEL SAIDY", 8, 9, 1, 16578, 1319.6, 15258.4, 1099, 14159.4, 1.0, 1769.93),
      fila("TREVIÃO, EDUARDO AL", 9, 18, 0, 22482, 6434.4, 16047.6, 0, 16047.6, 2.0, 1783.07)
    ],
    promedio: prom(8, 13, 20501.75, 15054.95, 14530.45, 1.28, 1446.2)
  },
  {
    dia: "2026-09-07",
    // Solo DOS vendedores: la media tiene que cuadrar igual con pocas filas.
    filas: [
      fila("REYES, ITZEL SAIDY", 2, 2, 0, 3998, 1599.2, 2398.8, 0, 2398.8, 1.0, 1199.4),
      fila("TREVIÃO, EDUARDO AL", 8, 16, 0, 26484, 5927.58, 20556.42, 0, 20556.42, 2.0, 2569.55)
    ],
    promedio: prom(5, 9, 15241, 11477.61, 11477.61, 1.5, 1884.48)
  },
  {
    dia: "2026-09-09",
    filas: [
      fila("HERNANDEZ, JESUS ADR", 1, 1, 0, 1299, 0, 1299, 0, 1299, 1.0, 1299),
      fila("POPOCA, WAIRA ZITLAL", 1, 3, 0, 3697, 1700.62, 1996.38, 0, 1996.38, 3.0, 1996.38),
      fila("REYES, ITZEL SAIDY", 1, 2, 0, 3998, 1839.08, 2158.92, 0, 2158.92, 2.0, 2158.92)
    ],
    promedio: prom(1, 2, 2998, 1818.1, 1818.1, 2.0, 1818.1)
  }
];

const reporte = (r: (typeof REPORTES)[number]) => ({
  from: r.dia,
  to: r.dia,
  storeNumber: "3029",
  rows: r.filas,
  promedio: r.promedio
});

for (const r of REPORTES) {
  test(`el promedio impreso cuadra con las filas — ${r.dia}`, () => {
    assert.deepEqual(promedioProblemas(r.filas, r.promedio), []);
  });

  test(`el reporte completo se acepta — ${r.dia}`, () => {
    const salida = posCaptureRows(reporte(r));
    assert.equal(salida.ok, true, salida.ok ? "" : salida.error);
    if (salida.ok) assert.equal(salida.value.length, r.filas.length);
  });
}

test("⚠️ una fila perdida se caza, que es para lo que existe esto", () => {
  /*
   * El caso que ninguna otra comprobacion ve. Se quita a Trevino del 4 de
   * septiembre: las tres filas que quedan cuadran PERFECTAMENTE entre ellas
   * --sus cuatro cuentas internas no cambian-- y el dia entraria con 7 piezas
   * en vez de 9. En el kardex eso son dos piezas que nunca se restaron.
   */
  const r = REPORTES[0];
  const sinTrevino = r.filas.slice(0, 3);

  // Primero: sin el promedio, esas tres filas pasan todo lo demas.
  const salidaVieja = posCaptureRows({ from: r.dia, to: r.dia, storeNumber: "3029", rows: sinTrevino, promedio: null });
  assert.equal(salidaVieja.ok, false);
  assert.match(salidaVieja.ok ? "" : salidaVieja.error, /Promedio/, "sin el pie no se puede comprobar y hay que decirlo");

  // Y con el promedio, se detiene y dice cuanto se desvia.
  const problemas = promedioProblemas(sinTrevino, r.promedio);
  assert.ok(problemas.length >= 3, JSON.stringify(problemas));
  assert.match(problemas.join(" "), /Bruto Ventas/);
  assert.match(problemas.join(" "), /4097\.75/, "tiene que decir lo que imprime el reporte");
});

test("un solo peso mal leido se caza", () => {
  // Con cuatro filas, un peso mueve la media 25 centavos. La tolerancia son
  // 1.1 centavos, que es lo que cuesta el redondeo del propio reporte.
  const r = REPORTES[0];
  const conErrata = r.filas.map((f, i) => (i === 0 ? { ...f, gross: f.gross + 1 } : f));
  assert.ok(promedioProblemas(conErrata, r.promedio).length > 0);
});

test("un CENTAVO no se caza, y es correcto", () => {
  /*
   * La tolerancia tiene que cubrir el redondeo a dos decimales del propio
   * reporte --medido: la mayor desviacion real en los cinco dias fue medio
   * centavo--. Apretarla mas rechazaria lecturas buenas todos los dias, y un
   * centavo no mueve ni la comision ni el inventario.
   */
  const r = REPORTES[0];
  const conCentavo = r.filas.map((f, i) => (i === 0 ? { ...f, gross: f.gross + 0.01 } : f));
  assert.deepEqual(promedioProblemas(conCentavo, r.promedio), []);
});

test("⚠️ los ENTEROS vienen redondeados y no se pueden comparar exacto", () => {
  // 5 de septiembre: las unidades promedian 6.5 y el reporte imprime 7.
  // Exigir igualdad ahi rechazaria un reporte perfecto todos los dias que
  // caiga en medio.
  const r = REPORTES[1];
  assert.deepEqual(promedioProblemas(r.filas, r.promedio), []);
  // Pero una unidad entera de mas en el promedio sigue saltando.
  assert.ok(promedioProblemas(r.filas, { ...r.promedio, units: 9 }).length > 0);
});

test("sin filas no se afirma que el promedio cuadre", () => {
  assert.equal(promedioProblemas([], REPORTES[0].promedio).length, 1);
});

test("⚠️ el prompt pide el pie y NO deja que el modelo lo calcule", () => {
  /*
   * Un promedio calculado por el propio modelo a partir de las filas que leyo
   * cuadraria SIEMPRE --incluidas las lecturas a las que les falta una fila--
   * y este candado no serviria absolutamente de nada.
   */
  const fs = require("node:fs") as typeof import("node:fs");
  const prompt = fs.readFileSync(require("node:path").join(__dirname, "..", "lib", "pos-vision.ts"), "utf8");
  assert.match(prompt, /nunca la calcules tu/, "el prompt no prohibe calcular el promedio");
  assert.match(prompt, /va aparte, en "promedio"/, "el prompt no la separa de las filas");
  assert.doesNotMatch(prompt, /NO incluyas la fila "Promedio"\./, "el prompt sigue tirando el pie");
});
