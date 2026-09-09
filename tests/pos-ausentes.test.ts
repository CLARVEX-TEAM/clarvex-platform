import assert from "node:assert/strict";
import test from "node:test";
import { avisoDeAusentes, quienFaltaEnElReporte, type PersonaEnHorario } from "../lib/pos-ausentes";

/*
 * Por qué existen estas pruebas.
 *
 * ⚠️ **Esto es la venta del día, y de ahí sale el inventario teórico.** Una
 * fila del reporte que el lector no vio se lleva las piezas de esa persona: el
 * kardex resta de menos, la existencia teórica queda alta, y el descuadre no
 * aparece hasta el conteo físico — semanas después, sin rastro de qué día fue.
 *
 * Las cuatro cuentas del reporte no lo detectan: son todas DENTRO de la fila,
 * así que las filas que sobrevivieron cuadran perfecto.
 */

const P = (userId: string, name: string, status: string): PersonaEnHorario => ({ userId, name, status });

const HORARIO = [
  P("itzel", "ITZEL SAIDY REYES BAUTISTA", "WORKING"),
  P("jazmin", "JAZMIN CASTRO ZUÑIGA", "WORKING"),
  P("waira", "WAIRA ZITLALI POPOCA", "WORKING"),
  P("alonso", "ALONSO TREVIÑO", "OFF")
];

test("señala a quien estaba en el piso y no viene en el reporte", () => {
  assert.deepEqual(quienFaltaEnElReporte(HORARIO, ["itzel", "waira"]), ["JAZMIN CASTRO ZUÑIGA"]);
});

test("quien descansa no se echa de menos", () => {
  // Alonso está OFF: que no aparezca en el reporte es lo esperado. Nombrarlo
  // enseñaría a ignorar el aviso.
  const faltan = quienFaltaEnElReporte(HORARIO, ["itzel", "jazmin", "waira"]);
  assert.deepEqual(faltan, []);
});

test("el día de inventario también se está en el piso", () => {
  // `INVENTORY` cuenta como laborado en toda la app (ver `lib/fair-quota.ts`),
  // y esa persona vende igual.
  const horario = [P("waira", "WAIRA ZITLALI POPOCA", "INVENTORY")];
  assert.deepEqual(quienFaltaEnElReporte(horario, []), ["WAIRA ZITLALI POPOCA"]);
});

test("vacaciones y día pagado no cuentan", () => {
  const horario = [P("a", "A", "VACATION"), P("b", "B", "PAID_DAY"), P("c", "C", "TERMINATED")];
  assert.deepEqual(quienFaltaEnElReporte(horario, []), []);
});

test("⚠️ sin horario capturado NO se avisa de nadie", () => {
  /*
   * «No hay horario» no es «no trabajó nadie». Si el horario va con retraso, el
   * aviso saldría con la tienda entera cada vez, y un aviso que sale siempre es
   * uno que ya nadie lee — justo el día en que señala algo real.
   */
  assert.deepEqual(quienFaltaEnElReporte([], []), []);
});

test("con todos presentes no hay aviso", () => {
  assert.deepEqual(quienFaltaEnElReporte(HORARIO, ["itzel", "jazmin", "waira", "alonso"]), []);
  assert.equal(avisoDeAusentes([]), null);
});

test("los nombres salen ordenados, no en el orden del horario", () => {
  // El horario llega en el orden que devuelva la base. Un aviso que cambia de
  // orden entre dos lecturas del mismo día se lee como si cambiara el dato.
  const horario = [P("w", "WAIRA", "WORKING"), P("a", "ALONSO", "WORKING"), P("j", "JAZMIN", "WORKING")];
  assert.deepEqual(quienFaltaEnElReporte(horario, []), ["ALONSO", "JAZMIN", "WAIRA"]);
});

test("el aviso PREGUNTA, no afirma que se haya perdido la fila", () => {
  /*
   * Desde aquí no se puede distinguir «no vendió» de «se perdió su renglón».
   * Afirmar lo segundo manda a revisar un reporte que estaba bien; callar deja
   * pasar el que no lo estaba. Por eso se describe el hecho y se pide mirar.
   */
  const aviso = avisoDeAusentes(["JAZMIN CASTRO ZUÑIGA"]);
  assert.ok(aviso);
  assert.match(aviso, /JAZMIN CASTRO ZUÑIGA/);
  assert.match(aviso, /Comprueba/, "el aviso tiene que mandar a mirar el reporte");
  assert.doesNotMatch(aviso, /se perdió|falta su venta/, "no puede afirmar lo que no sabe");
});

test("el aviso concuerda en singular y en plural", () => {
  const uno = avisoDeAusentes(["ANA"]);
  assert.ok(uno && uno.includes("ANA trabajó ese día y no aparece"), uno ?? "");

  const dos = avisoDeAusentes(["ANA", "BETO"]);
  assert.ok(dos && dos.includes("ANA y BETO trabajaron ese día y no aparecen"), dos ?? "");

  const tres = avisoDeAusentes(["ANA", "BETO", "CARLA"]);
  assert.ok(tres && tres.includes("ANA, BETO y CARLA trabajaron"), tres ?? "");
});
