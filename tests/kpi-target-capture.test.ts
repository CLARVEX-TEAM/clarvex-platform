import assert from "node:assert/strict";
import test from "node:test";
import { METRICAS, plantilla, validar } from "../lib/kpi-target-capture";
import { METRIC_CONFIG } from "../lib/kpi-view";

test("las metricas del catalogo son las que la app sabe pintar", () => {
  /*
   * Si alguien anade una tarjeta en `kpi-view` y no aqui, esa metrica no se
   * podra capturar y su semaforo se queda sin objetivo para siempre. Y al
   * reves: capturar una que no existe guarda un numero que nadie lee.
   */
  assert.deepEqual(Object.keys(METRICAS).sort(), Object.keys(METRIC_CONFIG).sort());
});

test("una metrica inventada se rechaza", () => {
  // El endpoint viejo aceptaba texto libre: «convercion» se guardaba tan
  // tranquilo y no casaba con ninguna tarjeta.
  const r = validar("convercion", "MES", 6.8);
  assert.equal(r.ok, false);
  assert.match(r.ok === false ? r.motivo : "", /no es una métrica/);
});

test("un periodo invalido se rechaza", () => {
  assert.equal(validar("upt", "DIA", 1.9).ok, false);
  assert.equal(validar("upt", "SEMANA", 1.9).ok, true);
  assert.equal(validar("upt", "MES", 1.9).ok, true);
});

test("el tope caza el punto decimal olvidado", () => {
  /*
   * Este es el fallo que motiva los topes: teclear 1.90 sin punto da 190, la
   * tarjeta se pinta en rojo para siempre y parece que la tienda va fatal.
   * Sin tope se guarda y cuesta dias averiguar por que el semaforo no cambia.
   */
  const r = validar("upt", "MES", 190);
  assert.equal(r.ok, false);
  assert.match(r.ok === false ? r.motivo : "", /punto decimal/);

  assert.equal(validar("upt", "MES", 1.9).ok, true);
});

test("cada metrica tiene su propio tope", () => {
  // Un AUR de 1157 es normal; un UPT de 1157 es un dedazo. El tope no puede
  // ser el mismo para todas.
  assert.equal(validar("aur", "MES", 1157).ok, true);
  assert.equal(validar("upt", "MES", 1157).ok, false);
  assert.equal(validar("conversion", "MES", 6.8).ok, true);
  assert.equal(validar("conversion", "MES", 680).ok, false);
});

test("no se aceptan objetivos negativos", () => {
  assert.equal(validar("ept", "MES", -100).ok, false);
});

test("lo que no es numero se rechaza con su nombre", () => {
  const r = validar("ept", "MES", "no soy un numero");
  assert.equal(r.ok, false);
  assert.match(r.ok === false ? r.motivo : "", /EPT/);
});

test("acepta texto con formato de captura", () => {
  // Retool manda cadenas; y la gente pega «2,203.00» tal cual del reporte.
  const r = validar("ept", "MES", "2,203.00");
  assert.equal(r.ok === true && r.valor, 2203);
  assert.equal(validar("upt", "MES", " 1.9 ").ok, true);
});

test("se redondea a dos decimales, como la columna", () => {
  // La columna es Decimal(12,2). Si no se redondea aqui, lo hace la base en
  // silencio y el numero guardado no es el que se tecleo.
  const r = validar("aur", "MES", 1157.006);
  assert.equal(r.ok === true && r.valor, 1157.01);
});

test("el margen esta marcado como TECHO", () => {
  /*
   * Es la unica donde pasarse es MALO: el margen de descuento es un limite,
   * no una meta. Llamarlo «meta» en pantalla invita a intentar alcanzarlo,
   * que es lo contrario de lo que se quiere.
   */
  assert.equal(METRICAS.margen.techo, true);
  for (const [nombre, config] of Object.entries(METRICAS)) {
    if (nombre !== "margen") assert.ok(!config.techo, `${nombre} no deberia ser techo`);
  }
});

test("la plantilla trae las nueve por los dos periodos", () => {
  const p = plantilla();
  assert.equal(p.length, Object.keys(METRICAS).length * 2);
  assert.equal(p.filter((o) => o.period === "SEMANA").length, Object.keys(METRICAS).length);
});
