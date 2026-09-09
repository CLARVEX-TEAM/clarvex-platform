import assert from "node:assert/strict";
import test from "node:test";
import {
  esEntrada,
  rangoVisible,
  resumirSeleccion,
  tiposDesconocidos,
  type MovimientoSeleccionable
} from "../lib/kardex-seleccion";

/*
 * Por qué existen estas pruebas.
 *
 * ⚠️ **Esto es inventario.** El número que salga de aquí es el que se compara
 * contra lo que llegó del CEDIS o contra lo que se contó en el piso. Una suma
 * que mezcla lo que entró con lo que salió no da un dato malo: da un dato que
 * no significa NADA, y aun así se lee como si significara algo.
 */

const M = (id: string, date: string, type: string, quantity: number): MovimientoSeleccionable => ({
  id,
  date,
  type,
  quantity
});

test("suma las piezas de lo seleccionado y las reparte por día", () => {
  const resumen = resumirSeleccion([
    M("1", "2026-09-01", "RECEPCION", 40),
    M("2", "2026-09-01", "RECEPCION", 12),
    M("3", "2026-09-03", "RECEPCION", 7)
  ]);

  assert.equal(resumen.filas, 3);
  assert.equal(resumen.entradas, 59);
  assert.equal(resumen.salidas, 0);
  assert.equal(resumen.neto, 59);
  assert.equal(resumen.mezcla, false);
  assert.deepEqual(
    resumen.porDia.map((dia) => [dia.date, dia.filas, dia.entradas]),
    [
      ["2026-09-01", 2, 52],
      ["2026-09-03", 1, 7]
    ]
  );
});

test("⚠️ mezclar entradas y salidas NO se resuelve con un solo total", () => {
  /*
   * `quantity` va SIEMPRE en positivo y el sentido lo pone el tipo. Una
   * recepción de 40 y un traspaso de salida de 10 sumados a secas dan 50, que
   * no es lo que entró (40), ni lo que salió (10), ni el saldo (30).
   *
   * Se comprueban las tres cifras Y la bandera: sin la bandera, la pantalla no
   * tiene forma de saber que no puede enseñar «50 piezas».
   */
  const resumen = resumirSeleccion([
    M("1", "2026-09-01", "RECEPCION", 40),
    M("2", "2026-09-01", "TRANSFERENCIA_SALIDA", 10)
  ]);

  assert.equal(resumen.entradas, 40);
  assert.equal(resumen.salidas, 10, "las salidas van en positivo: son piezas que salieron");
  assert.equal(resumen.neto, 30);
  assert.equal(resumen.mezcla, true, "sin esto la pantalla enseñaría un total inventado");
});

test("una selección de puras salidas no se marca como mezcla", () => {
  // La bandera avisa de sentidos MEZCLADOS, no de que haya salidas. Un filtro
  // por traspasos de salida es un caso normal y su total sí es un dato.
  const resumen = resumirSeleccion([
    M("1", "2026-09-01", "TRANSFERENCIA_SALIDA", 10),
    M("2", "2026-09-02", "SFS", 4)
  ]);

  assert.equal(resumen.mezcla, false);
  assert.equal(resumen.salidas, 14);
  assert.equal(resumen.neto, -14);
});

test("los siete tipos caen del lado que les toca", () => {
  // Es la misma regla de `signedQuantity`, y se comprueba aquí porque este
  // módulo decide con ella de qué lado va cada pieza de la suma.
  for (const tipo of ["RECEPCION", "TRANSFERENCIA_ENTRADA", "DEVOLUCION_CLIENTE", "AJUSTE_POSITIVO"]) {
    assert.equal(esEntrada(tipo), true, `${tipo} debería sumar`);
  }
  for (const tipo of ["TRANSFERENCIA_SALIDA", "SFS", "AJUSTE_NEGATIVO"]) {
    assert.equal(esEntrada(tipo), false, `${tipo} debería restar`);
  }
});

test("«filas» cuenta MOVIMIENTOS, no días", () => {
  // Dos recepciones el mismo día son dos folios distintos: contarlas como una
  // haría pensar que llegó un solo manifiesto.
  const resumen = resumirSeleccion([
    M("1", "2026-09-01", "RECEPCION", 40),
    M("2", "2026-09-01", "RECEPCION", 12)
  ]);
  assert.equal(resumen.filas, 2);
  assert.equal(resumen.porDia.length, 1);
});

test("una cantidad que no es número se descarta ENTERA, no como cero", () => {
  /*
   * ⚠️ Contarla como cero dejaría el número de filas diciendo que se sumaron
   * tres movimientos cuando solo se sumaron dos. El total sería correcto y el
   * renglón de al lado mentiría, que es peor que un total malo: no se nota.
   */
  const resumen = resumirSeleccion([
    M("1", "2026-09-01", "RECEPCION", 40),
    M("2", "2026-09-01", "RECEPCION", Number.NaN),
    M("3", "2026-09-01", "RECEPCION", 2)
  ]);
  assert.equal(resumen.filas, 2);
  assert.equal(resumen.entradas, 42);
});

test("los días salen del más viejo al más nuevo, no en el orden que llegaron", () => {
  const resumen = resumirSeleccion([
    M("1", "2026-09-05", "RECEPCION", 1),
    M("2", "2026-09-01", "RECEPCION", 1),
    M("3", "2026-09-03", "RECEPCION", 1)
  ]);
  assert.deepEqual(resumen.porDia.map((dia) => dia.date), ["2026-09-01", "2026-09-03", "2026-09-05"]);
});

test("sin nada seleccionado no se inventa un resumen", () => {
  const resumen = resumirSeleccion([]);
  assert.deepEqual(resumen, { filas: 0, entradas: 0, salidas: 0, neto: 0, mezcla: false, porDia: [], tipos: [] });
});

test("⚠️ el rango de shift+clic va en el orden de PANTALLA, no en el de la base", () => {
  /*
   * La lista se filtra y se ordena antes de pintarse. Tomar el rango del orden
   * original marcaría filas que no se están viendo, y el total incluiría
   * movimientos que la persona no eligió — sin nada en pantalla que lo delate.
   */
  const enPantalla = ["c", "a", "d", "b"];
  assert.deepEqual(rangoVisible(enPantalla, "a", "b"), ["a", "d", "b"]);
});

test("el rango funciona marcando de abajo hacia arriba", () => {
  const enPantalla = ["c", "a", "d", "b"];
  assert.deepEqual(rangoVisible(enPantalla, "b", "a"), ["a", "d", "b"]);
});

test("un extremo que ya no está en pantalla no arrastra la lista entera", () => {
  // Pasa al cambiar el filtro con una fila ya marcada: el ancla desaparece.
  // Devolver todo desde el principio marcaría medio kardex de un clic.
  assert.deepEqual(rangoVisible(["a", "b", "c"], "zzz", "b"), ["b"]);
  assert.deepEqual(rangoVisible(["a", "b", "c"], "zzz", "yyy"), []);
});

test("un tipo que esta pantalla no conoce se declara en vez de callarse", () => {
  // Si mañana el kardex gana un tipo nuevo, esta pantalla lo sumaría como
  // entrada. Puede ser correcto o no; lo que no puede es no decirlo.
  const movimientos = [M("1", "2026-09-01", "RECEPCION", 1), M("2", "2026-09-01", "MERMA", 3)];
  assert.deepEqual(tiposDesconocidos(movimientos, ["RECEPCION", "SFS"]), ["MERMA"]);
  assert.deepEqual(tiposDesconocidos(movimientos, ["RECEPCION", "MERMA"]), []);
});
