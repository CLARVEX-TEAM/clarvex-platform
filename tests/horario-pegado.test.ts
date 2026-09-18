import assert from "node:assert/strict";
import test from "node:test";
import { parseSchedulePaste } from "../lib/schedule-parser";

/*
 * Por qué existen estas pruebas.
 *
 * La tienda lleva los descansos en un Excel y los vuelve a teclear en Retool.
 * Esto lee el bloque pegado para no capturarlo dos veces.
 *
 * ⚠️ **Es el dato que decide el sueldo.** De aquí salen los retardos, el banco
 * de minutos, la prima dominical y el reparto de Cuota Justa. Un descanso
 * corrido un día no se ve al revisar la pantalla: se ve cuando alguien no viene
 * a trabajar.
 *
 * Por eso el bloque de abajo es el REAL, copiado de la hoja de TH San Agustín
 * (semana 40, octubre de 2026), con sus nombres, sus números de empleado y su
 * fila de totales al final.
 */

const SEMANA_40 = [
  "SEMANA\t# DE EMPLEADO\tNOMBRE\tDOMINGO\tLUNES\tMARTES\tMIÉRCOLES\tJUEVES\tVIERNES\tSÁBADO\tDÍAS LABORADOS POR PERSONA",
  "40\t\t\t04/10/2026\t05/10/2026\t06/10/2026\t07/10/2026\t08/10/2026\t09/10/2026\t10/10/2026\t",
  "GERENTE\t81893\tITZEL SAIDY REYES BAUTISTA\tLABORANDO\tLABORANDO\tLABORANDO\tDESCANSO\tDESCANSO\tPAGO DIA\tPAGO DIA\t3",
  "SUBGERENTE1\t102259\tJESUS ADRIAN HERNANDEZ LUNA\tLABORANDO\tLABORANDO\tLABORANDO\tLABORANDO\tLABORANDO\tLABORANDO\tLABORANDO\t7",
  "ASESOR1\t95739\tWAIRA ZITLALI POPOCA\tLABORANDO\tLABORANDO\tLABORANDO\tLABORANDO\tLABORANDO\tLABORANDO\tLABORANDO\t7",
  "ASESOR2\t96383\tJAZMIN CASTRO ZUÑIGA\tLABORANDO\tLABORANDO\tLABORANDO\tLABORANDO\tLABORANDO\tLABORANDO\tLABORANDO\t7",
  "ASESOR3\t113642\tALONSO TREVIÑO\tLABORANDO\tLABORANDO\tLABORANDO\tLABORANDO\tLABORANDO\tLABORANDO\tLABORANDO\t7",
  "N° PERSONAS LABORANDO POR DÍA\t\t\t5\t5\t5\t4\t4\t4\t4\t"
].join("\n");

function delDia(resultado: ReturnType<typeof parseSchedulePaste>, numero: string, fecha: string) {
  return resultado.records.find((r) => r.employeeNumber === numero && r.date.toISOString().slice(0, 10) === fecha);
}

test("lee la semana real tal como se copia de Excel", () => {
  const leido = parseSchedulePaste(SEMANA_40);

  assert.deepEqual(leido.problemas, [], "no debería haber nada que reportar");
  assert.equal(leido.records.length, 35, "cinco personas por siete días");
  assert.deepEqual(
    leido.employeeNumbers.sort(),
    ["102259", "113642", "81893", "95739", "96383"],
    "empareja por número de empleado, no por nombre"
  );
});

test("los descansos de Itzel caen en SUS dias, no corridos", () => {
  const leido = parseSchedulePaste(SEMANA_40);
  // Miércoles 7 y jueves 8 descansa; viernes 9 y sábado 10 son pago de día.
  assert.equal(delDia(leido, "81893", "2026-10-06")?.status, "WORKING", "martes trabaja");
  assert.equal(delDia(leido, "81893", "2026-10-07")?.status, "OFF", "miércoles descansa");
  assert.equal(delDia(leido, "81893", "2026-10-08")?.status, "OFF", "jueves descansa");
  assert.equal(delDia(leido, "81893", "2026-10-09")?.status, "PAID_DAY");
  assert.equal(delDia(leido, "81893", "2026-10-10")?.status, "PAID_DAY");
});

test("la fila de totales no se confunde con una persona", () => {
  const leido = parseSchedulePaste(SEMANA_40);
  // «N° PERSONAS LABORANDO POR DÍA» trae numeros en las columnas de los dias.
  assert.equal(leido.employeeNumbers.includes("5"), false);
  assert.equal(leido.records.some((r) => r.employeeName.includes("PERSONAS")), false);
});

test("⚠️ una fecha que no cuadra con su dia se REPORTA, no se adivina", () => {
  /*
   * Es la red de seguridad del pegado. En el archivo las fechas son números de
   * serie y no hay ambigüedad; pegadas llegan como texto, y «04/10/2026» se
   * puede leer día/mes o mes/día. La hoja lo resuelve sola: con día/mes salen
   * DOMINGO, LUNES, MARTES…, igual que los rótulos.
   *
   * Un mes de descansos corrido un día no se ve al revisarlo en pantalla.
   */
  const alReves = SEMANA_40.replace(
    "04/10/2026\t05/10/2026\t06/10/2026\t07/10/2026\t08/10/2026\t09/10/2026\t10/10/2026",
    "10/04/2026\t10/05/2026\t10/06/2026\t10/07/2026\t10/08/2026\t10/09/2026\t10/10/2026"
  );
  const leido = parseSchedulePaste(alReves);
  assert.ok(leido.problemas.length > 0, "tenía que reportarlo");
  assert.match(leido.problemas.join(" "), /d[ií]a\/mes/i, "y decir qué revisar");
});

test("la celda puede traer el estado Y la hora", () => {
  // Lo que pidió la tienda: la hoja no tiene horas, y se escriben solo en los
  // turnos que se salen del estandar, sin borrar la palabra.
  const conHoras = SEMANA_40.replace(
    "ASESOR1\t95739\tWAIRA ZITLALI POPOCA\tLABORANDO",
    "ASESOR1\t95739\tWAIRA ZITLALI POPOCA\tLABORANDO 12:00-21:00"
  );
  const leido = parseSchedulePaste(conHoras);
  const domingo = delDia(leido, "95739", "2026-10-04");
  assert.equal(domingo?.status, "WORKING");
  assert.equal(domingo?.startTime, "12:00");
  assert.equal(domingo?.endTime, "21:00");
  // Y el resto de sus días sigue sin horas: no se inventa nada.
  assert.equal(delDia(leido, "95739", "2026-10-05")?.startTime, null);
});

test("un rango a secas tambien es un turno, con la convencion de tienda", () => {
  const soloRango = SEMANA_40.replace(
    "ASESOR2\t96383\tJAZMIN CASTRO ZUÑIGA\tLABORANDO",
    "ASESOR2\t96383\tJAZMIN CASTRO ZUÑIGA\t12-9"
  );
  const leido = parseSchedulePaste(soloRango);
  const domingo = delDia(leido, "96383", "2026-10-04");
  assert.equal(domingo?.status, "WORKING");
  // «12-9» es de mediodía a nueve de la noche, no a las nueve de la mañana.
  assert.equal(domingo?.startTime, "12:00");
  assert.equal(domingo?.endTime, "21:00");
});

test("⚠️ un DESCANSO con horas se queda sin horas", () => {
  /*
   * Un día libre con horario no significa nada, y guardarlas haría que la
   * asistencia lo midiera como si hubiera venido: retardo y banco de minutos
   * sobre un día que nadie trabajó.
   */
  const raro = SEMANA_40.replace("\tDESCANSO\tDESCANSO\t", "\tDESCANSO 10:30-19:00\tDESCANSO\t");
  const leido = parseSchedulePaste(raro);
  const miercoles = delDia(leido, "81893", "2026-10-07");
  assert.equal(miercoles?.status, "OFF");
  assert.equal(miercoles?.startTime, null);
});

test("un valor que no se entiende se reporta en vez de tragarse", () => {
  const raro = SEMANA_40.replace("\tPAGO DIA\tPAGO DIA\t", "\tPERMISO ESPECIAL\tPAGO DIA\t");
  const leido = parseSchedulePaste(raro);
  assert.match(leido.problemas.join(" "), /PERMISO ESPECIAL/);
});

test("un pegado que no es un horario lo dice", () => {
  const leido = parseSchedulePaste("hola\tque tal\notra fila");
  assert.equal(leido.records.length, 0);
  assert.match(leido.problemas.join(" "), /No encontr/i);
});

test("varias semanas en un solo pegado", () => {
  const dos = `${SEMANA_40}\n\n${SEMANA_40
    .replace("04/10/2026\t05/10/2026\t06/10/2026\t07/10/2026\t08/10/2026\t09/10/2026\t10/10/2026",
      "11/10/2026\t12/10/2026\t13/10/2026\t14/10/2026\t15/10/2026\t16/10/2026\t17/10/2026")
    .replace("\t40\t", "\t41\t")}`;
  const leido = parseSchedulePaste(dos);
  assert.deepEqual(leido.problemas, []);
  assert.equal(leido.records.length, 70, "dos semanas de cinco personas");
  assert.ok(delDia(leido, "81893", "2026-10-11"), "la segunda semana también entra");
});
