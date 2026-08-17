import assert from "node:assert/strict";
import test from "node:test";
import { columnIndex, columnLetter, escapeXml, readRowTemplate, replaceDataRows, setTableRows, toExcelSerial } from "../lib/kardex-xlsx";

// Fila molde como la que deja `scripts/build-kardex-template.ts`: celdas con su
// indice de estilo y sin valor.
const HOJA = `<sheetData><row r="6" spans="2:7"><c r="B6" s="99"/></row><row r="7" spans="2:7"><c r="B7" s="100"/><c r="C7" s="3"/><c r="D7" s="3"/><c r="E7" s="3"/><c r="F7" s="3"/><c r="G7" s="49"/></row></sheetData>`;

const plantilla = () => readRowTemplate(HOJA, 7);

test("la fecha se escribe como serial de Excel", () => {
  // 46072 es el valor real que trae su archivo para el 19 de febrero de 2026.
  assert.equal(toExcelSerial(new Date("2026-02-19T00:00:00.000Z")), 46072);
});

test("un folio de solo digitos se escribe como NUMERO", () => {
  // El resumen cuenta las transferencias con COUNT(Tabla2[Folio]), y COUNT solo
  // cuenta celdas numericas: como texto quedaba "Transferencias realizadas: 0"
  // junto a 25 piezas enviadas.
  const xml = replaceDataRows(HOJA, 7, 2, [[null, "174569", 25, null, "O. MTY", "ESTAFETA"]], plantilla());
  assert.match(xml, /<c r="C7" s="3"><v>174569<\/v><\/c>/);
  assert.doesNotMatch(xml, /<c r="C7"[^>]*t="inlineStr"/);
});

test("un folio alfanumerico sigue siendo texto", () => {
  const xml = replaceDataRows(HOJA, 7, 2, [[null, "K10170230", 4, null, null, null]], plantilla());
  assert.match(xml, /<c r="C7" s="3" t="inlineStr"><is><t xml:space="preserve">K10170230<\/t><\/is><\/c>/);
});

test("un numero con cero delante NO se convierte", () => {
  // Perderia el cero, y los APTO de las tiendas empiezan por 0.
  const xml = replaceDataRows(HOJA, 7, 2, [[null, "03009", 1, null, null, null]], plantilla());
  assert.match(xml, /t="inlineStr"><is><t xml:space="preserve">03009</);
});

test("un numero larguisimo se queda como texto", () => {
  // Mas de 15 digitos ya no cabe exacto en un double.
  const largo = "1234567890123456789";
  const xml = replaceDataRows(HOJA, 7, 2, [[null, largo, 1, null, null, null]], plantilla());
  assert.match(xml, /t="inlineStr"/);
});

test("cada celda conserva el estilo de la fila molde", () => {
  // Sin el atributo `s`, las fechas saldrian como numeros crudos y la fila
  // perderia bordes y fuente.
  const xml = replaceDataRows(HOJA, 7, 2, [[new Date("2026-02-19T00:00:00.000Z"), "A", 1, null, null, null]], plantilla());
  assert.match(xml, /<c r="B7" s="100"><v>46072<\/v><\/c>/);
  assert.match(xml, /<c r="G7" s="49"\/>/);
});

test("se escriben TODAS las columnas del molde, aunque vayan vacias", () => {
  // Una celda omitida pierde su estilo y parte la tabla visualmente.
  const xml = replaceDataRows(HOJA, 7, 2, [[null, "A", 1, null, null, null]], plantilla());
  for (const col of ["B7", "C7", "D7", "E7", "F7", "G7"]) {
    assert.match(xml, new RegExp(`<c r="${col}"`), `falta ${col}`);
  }
});

test("sin filas queda una fila vacia con sus estilos", () => {
  const xml = replaceDataRows(HOJA, 7, 2, [], plantilla());
  assert.match(xml, /<c r="B7" s="100"\/>/);
  assert.doesNotMatch(xml, /<v>/);
});

test("varias filas se numeran de forma consecutiva", () => {
  const xml = replaceDataRows(HOJA, 7, 2, [[null, "A", 1], [null, "B", 2], [null, "C", 3]], plantilla());
  assert.match(xml, /<row r="7"/);
  assert.match(xml, /<row r="9"/);
});

test("el rango de la tabla nunca baja del encabezado mas una fila", () => {
  // Una tabla de Excel exige al menos una fila de datos.
  const tabla = '<table ref="B6:G500"><autoFilter ref="B6:G500"/></table>';
  assert.match(setTableRows(tabla, 20), /ref="B6:G20"/);
  assert.match(setTableRows(tabla, 6), /ref="B6:G7"/);
  assert.match(setTableRows(tabla, 3), /ref="B6:G7"/);
});

test("el autoFilter se mueve con el rango", () => {
  const tabla = '<table ref="B6:G500"><autoFilter ref="B6:G500"/></table>';
  const out = setTableRows(tabla, 12);
  assert.equal((out.match(/B6:G12/g) ?? []).length, 2);
});

test("las letras de columna van y vienen", () => {
  assert.equal(columnLetter(1), "A");
  assert.equal(columnLetter(9), "I");
  assert.equal(columnLetter(27), "AA");
  assert.equal(columnIndex("A"), 1);
  assert.equal(columnIndex("I"), 9);
  assert.equal(columnIndex("AA"), 27);
});

test("el texto se escapa para no romper el XML", () => {
  assert.equal(escapeXml('A & B <c> "x"'), "A &amp; B &lt;c&gt; &quot;x&quot;");
});
