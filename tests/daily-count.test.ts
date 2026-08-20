import assert from "node:assert/strict";
import test from "node:test";
import {
  checkRow,
  copyLines,
  nextSectionPosition,
  rowMovement,
  summarize,
  type DailyRow
} from "../lib/daily-count";

function row(partial: Partial<DailyRow> & { number: number; position: number }): DailyRow {
  return {
    label: null,
    previous: null,
    current: null,
    reason: null,
    reasonRef: null,
    ...partial
  };
}

test("la posición de export NO recicla huecos", () => {
  // El marbete retirado dejó libre la 2, pero el nuevo se va al final: si se
  // reciclara, el «marbete 2» de un reporte viejo apuntaría a otro rack.
  assert.equal(nextSectionPosition([1, 3, 4]), 5);
  assert.equal(nextSectionPosition([]), 1);
  // Aunque el marbete nuevo tenga número interno más bajo, la posición es la
  // siguiente: el orden es el de enrolamiento, no el numérico.
  assert.equal(nextSectionPosition([1, 2, 3]), 4);
});

test("sin uno de los dos conteos no hay movimiento", () => {
  // No contar y contar cero son cosas distintas: restarle a un hueco inventaría
  // un faltante del tamaño del rack entero.
  assert.equal(rowMovement(row({ number: 36, position: 1, previous: null, current: 12 })), null);
  assert.equal(rowMovement(row({ number: 36, position: 1, previous: 15, current: null })), null);
  assert.equal(rowMovement(row({ number: 36, position: 1, previous: 15, current: 0 })), -15);
});

test("«se movió» solo se confirma si el marbete destino SÍ subió", () => {
  const origin = row({
    number: 36, position: 1, previous: 15, current: 13,
    reason: "MOVIDO", reasonRef: "54"
  });
  const target = row({ number: 54, position: 2, previous: 8, current: 10 });
  const rows = [origin, target];
  assert.equal(checkRow(origin, rows).status, "OK");

  // El destino subió menos de lo reclamado → la coartada no se sostiene.
  const short = [origin, row({ number: 54, position: 2, previous: 8, current: 9 })];
  const check = checkRow(origin, short);
  assert.equal(check.status, "REVIEW");
  assert.match(check.status === "REVIEW" ? check.detail : "", /solo subió 1 de 2/);

  // El destino ni siquiera se ha contado.
  const uncounted = [origin, row({ number: 54, position: 2, previous: 8, current: null })];
  assert.equal(checkRow(origin, uncounted).status, "REVIEW");

  // El destino no es de la sección.
  const alone = [row({ ...origin, reasonRef: "99" })];
  assert.equal(checkRow(alone[0], alone).status, "REVIEW");
});

test("un marbete que sube o queda igual no pide justificación", () => {
  const up = row({ number: 36, position: 1, previous: 10, current: 14 });
  const same = row({ number: 37, position: 2, previous: 10, current: 10 });
  assert.equal(checkRow(up, [up, same]).status, "NONE");
  assert.equal(checkRow(same, [up, same]).status, "NONE");
});

test("sin motivo, o con «sin explicación», las piezas quedan pendientes", () => {
  const noReason = row({ number: 36, position: 1, previous: 15, current: 13 });
  assert.equal(checkRow(noReason, [noReason]).status, "PENDING");

  const declared = row({ ...noReason, reason: "SIN_EXPLICACION" });
  assert.equal(checkRow(declared, [declared]).status, "PENDING");
});

test("venta y salida exigen su referencia", () => {
  const sinEstilo = row({
    number: 36, position: 1, previous: 15, current: 13, reason: "VENTA", reasonRef: "  "
  });
  assert.equal(checkRow(sinEstilo, [sinEstilo]).status, "REVIEW");

  const conEstilo = row({ ...sinEstilo, reasonRef: "WW0WW12345" });
  assert.equal(checkRow(conEstilo, [conEstilo]).status, "OK");
});

test("mercancía que solo se movió de marbete deja el neto en cero", () => {
  // El error de junta: sumar las bajas y reportar 2 piezas perdidas cuando las
  // mismas 2 aparecieron en el marbete de al lado.
  const rows = [
    row({ number: 36, position: 1, previous: 15, current: 13, reason: "MOVIDO", reasonRef: "54" }),
    row({ number: 54, position: 2, previous: 8, current: 10 })
  ];
  const summary = summarize(rows);
  assert.equal(summary.drops, 2);
  assert.equal(summary.gains, 2);
  assert.equal(summary.net, 0);
  assert.equal(summary.unexplained, 0);
  assert.equal(summary.toReview, 0);
});

test("el resumen separa lo contado, lo sin explicar y lo que no se sostiene", () => {
  const rows = [
    // Bajó y nadie la justificó todavía.
    row({ number: 36, position: 1, previous: 15, current: 13 }),
    // Bajó, se declaró venta con estilo.
    row({ number: 37, position: 2, previous: 9, current: 7, reason: "VENTA", reasonRef: "ABC" }),
    // Bajó y dice haberse movido a un marbete que no subió.
    row({ number: 54, position: 3, previous: 6, current: 4, reason: "MOVIDO", reasonRef: "37" }),
    // Sin contar hoy: no entra en nada.
    row({ number: 60, position: 4, previous: 5, current: null })
  ];
  const summary = summarize(rows);
  assert.equal(summary.tags, 4);
  assert.equal(summary.counted, 3);
  assert.equal(summary.pieces, 24);
  assert.equal(summary.drops, 6);
  assert.equal(summary.gains, 0);
  assert.equal(summary.unexplained, 2);
  assert.equal(summary.toReview, 1);
});

test("copiar el conteo respeta el renglón de los marbetes sin contar", () => {
  // El marbete de la posición 2 no se contó. Su renglón tiene que salir EN
  // BLANCO: si se saltara, las 7 piezas del 3 se pegarían en el renglón del 2 y
  // todo lo de abajo quedaría corrido un lugar.
  const { text, positions, pending } = copyLines([
    row({ number: 36, position: 1, current: 15 }),
    row({ number: 37, position: 2, current: null }),
    row({ number: 54, position: 3, current: 7 })
  ]);
  assert.equal(text, "15\n\n7");
  assert.equal(positions, 3);
  assert.equal(pending, 1);
});

test("copiar rellena el hueco de un marbete retirado", () => {
  // La posición 2 ya no tiene marbete (se retiró). El renglón se conserva
  // igualmente, porque el Excel del supervisor sigue teniendo esa fila.
  const { text, pending } = copyLines([
    row({ number: 36, position: 1, current: 15 }),
    row({ number: 54, position: 3, current: 7 })
  ]);
  assert.equal(text, "15\n\n7");
  assert.equal(pending, 1);
});

test("copiar un conteo vacío no ofrece nada", () => {
  assert.equal(copyLines([]).positions, 0);
});
