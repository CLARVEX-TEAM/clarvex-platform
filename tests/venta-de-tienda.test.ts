import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { enTurnoHoy, resumirTienda, type FilaKpi } from "../lib/venta-de-tienda";

/**
 * La venta de tienda de «Mi día».
 *
 * ⚠️ Esto es DINERO en la pantalla que gerencia abre a diario, y sus fallos son
 * todos mudos: un total que no cuadra con su propia lista, un cero que en
 * realidad era «nadie ha capturado», o una devolución recortada que hace que la
 * cifra no coincida con la de Retool. Ninguno da error; todos se descubren
 * cuando alguien compara dos pantallas y ya no sabe cuál creer.
 */

function fila(parcial: Partial<FilaKpi> & { userId: string; nombre: string }): FilaKpi {
  return { venta: 0, meta: 0, tickets: 0, piezas: 0, ...parcial };
}

const EQUIPO: FilaKpi[] = [
  fila({ userId: "u1", nombre: "Itzel Treviño", venta: 6120, meta: 7000, tickets: 12, piezas: 21 }),
  fila({ userId: "u2", nombre: "Waira Popoca", venta: 5380.5, meta: 7000, tickets: 10, piezas: 18 }),
  fila({ userId: "yo", nombre: "Jesús Hernández", venta: 1910, meta: 2718.36, tickets: 4, piezas: 7 })
];

test("⚠️ el total es la SUMA de las filas que se enseñan", () => {
  // Si esto deja de cumplirse, la tarjeta se contradice a si misma: un total
  // arriba que no cuadra con la lista de abajo, y nadie sabria cual vale.
  const tienda = resumirTienda(EQUIPO, "yo");
  assert.ok(tienda);
  assert.equal(tienda.venta, 6120 + 5380.5 + 1910);
  assert.equal(tienda.meta, 7000 + 7000 + 2718.36);
  assert.equal(tienda.tickets, 26);
  assert.equal(tienda.piezas, 46);
  assert.equal(
    tienda.venta,
    tienda.personas.reduce((suma, persona) => suma + persona.venta, 0),
    "el total no cuadra con la lista"
  );
});

test("⚠️ sin ninguna fila devuelve null, que NO es cero", () => {
  /*
   * Una tienda que todavia no ha capturado y una que lleva cero vendido se ven
   * identicas con un «$0.00» delante, y son lo contrario la una de la otra. A
   * media manana lo normal es lo primero.
   */
  assert.equal(resumirTienda([], "yo"), null);

  const enCero = resumirTienda([fila({ userId: "u1", nombre: "Itzel" })], "yo");
  assert.notEqual(enCero, null, "una tienda con captura en cero SI tiene datos");
  assert.equal(enCero?.venta, 0);
  assert.equal(enCero?.capturadas, 1);
});

test("⚠️ una venta NEGATIVA se conserva", () => {
  /*
   * Una devolucion de cliente que no se compensa con otra venta deja el dia en
   * rojo, y asi se registra en toda la app. Recortarla aqui haria que el total
   * de esta tarjeta no cuadrara con Retool ni con el reporte del POS.
   */
  const conDevolucion = resumirTienda(
    [
      fila({ userId: "u1", nombre: "Itzel", venta: 1000 }),
      fila({ userId: "u2", nombre: "Waira", venta: -1500 })
    ],
    "yo"
  );
  assert.equal(conDevolucion?.venta, -500);
  assert.equal(conDevolucion?.personas.at(-1)?.venta, -1500, "la negativa se pierde por el camino");
});

test("la lista va de mayor a menor, y tu fila viene marcada", () => {
  const tienda = resumirTienda(EQUIPO, "yo");
  assert.deepEqual(
    tienda?.personas.map((persona) => persona.nombre),
    ["Itzel Treviño", "Waira Popoca", "Jesús Hernández"]
  );
  assert.deepEqual(
    tienda?.personas.map((persona) => persona.esTuyo),
    [false, false, true]
  );
});

test("⚠️ el orden no baila entre cargas con dos personas iguales", () => {
  /*
   * Sin desempate por nombre, dos personas en cero salen como las devuelva la
   * base y la lista se reordena sola de una carga a otra sin que nada haya
   * cambiado. Se lee como que los numeros se estan moviendo.
   */
  const unOrden = resumirTienda(
    [fila({ userId: "b", nombre: "Waira" }), fila({ userId: "a", nombre: "Alonso" })],
    "yo"
  );
  const elOtro = resumirTienda(
    [fila({ userId: "a", nombre: "Alonso" }), fila({ userId: "b", nombre: "Waira" })],
    "yo"
  );
  assert.deepEqual(
    unOrden?.personas.map((p) => p.nombre),
    elOtro?.personas.map((p) => p.nombre)
  );
  assert.deepEqual(unOrden?.personas.map((p) => p.nombre), ["Alonso", "Waira"]);
});

/**
 * ⚠️ El candado de verdad está en la CONSULTA, no en la pantalla.
 *
 * Escondiendo la tarjeta en el cliente, la venta de la tienda seguiría viajando
 * dentro de la respuesta que recibe un asesor: el dato estaría entregado y solo
 * sin pintar. La regla de roles de este proyecto dice que un asesor no ve
 * ventas ni metas que no sean las suyas, y eso es sobre el dato, no sobre el
 * píxel. Esta prueba mira el propio handler porque es lo único que lo demuestra.
 */
test("⚠️ la venta de tienda ni se CONSULTA para quien no es gerencia", () => {
  const ruta = join(__dirname, "..", "app", "api", "app", "native", "my-day", "route.ts");
  // Los saltos de línea los pone el formateador y cambian solos; lo que se
  // comprueba es el orden de las piezas, no cómo quedó repartido en renglones.
  const fuente = readFileSync(ruta, "utf8").replace(/\s+/g, " ");

  assert.match(
    fuente,
    /manager \? prisma\.kpi\.findMany/,
    "la consulta de la tienda ya no está detrás de `manager`: un asesor recibiría la venta de toda la tienda en su respuesta"
  );
  // `[^)]*` y no `[^}]*`: el `where` lleva llaves anidadas --el rango de
  // fechas-- y cortar en la primera dejaba la prueba mirando medio filtro.
  assert.match(
    fuente,
    /manager \? prisma\.kpi\.findMany\([^)]*user: PERSON_WHERE/,
    "falta `user: PERSON_WHERE` en la consulta de la tienda: el celular de la tienda está dado de alta como ASESOR y entraría en la lista como alguien que no vendió nada"
  );
});

test("nadie es «tuyo» si tu no tienes fila hoy", () => {
  // Gerencia sin KPI capturado sigue viendo la tienda; simplemente no se
  // destaca ninguna linea. Marcar una ajena seria peor que no marcar ninguna.
  const tienda = resumirTienda(EQUIPO, "no-capturo");
  assert.equal(tienda?.personas.some((persona) => persona.esTuyo), false);
  assert.equal(tienda?.capturadas, 3);
});

/*
 * ── Solo quien está en turno ──────────────────────────────────────────────
 *
 * Reportado desde la tienda el 29 de septiembre de 2026: la lista salía con las
 * cinco personas en `$0.00`, incluida la que descansaba. No era un fallo de
 * captura: guardar Cuota Justa escribe la meta diaria de TODA la semana por
 * adelantado, con venta, tickets y piezas en cero, así que todo el equipo tiene
 * fila todos los días.
 */

const HORARIO = [
  { userId: "u1", status: "WORKING" },
  { userId: "u2", status: "OFF" },
  { userId: "yo", status: "WORKING" }
];

test("⚠️ quien descansa y no vendió NO sale en la lista", () => {
  const tienda = resumirTienda(
    [
      fila({ userId: "u1", nombre: "Itzel Treviño", venta: 6120, meta: 7000, tickets: 12, piezas: 21 }),
      fila({ userId: "u2", nombre: "Waira Popoca", meta: 7000 }),
      fila({ userId: "yo", nombre: "Jesús Hernández", venta: 1910, meta: 2718.36, tickets: 4, piezas: 7 })
    ],
    "yo",
    enTurnoHoy(HORARIO)
  );
  assert.deepEqual(tienda?.personas.map((p) => p.nombre), ["Itzel Treviño", "Jesús Hernández"]);
});

test("⚠️ pero la META sigue siendo la de la TIENDA, con ausentes incluidos", () => {
  // Gerencia se mide contra la meta de la tienda entera, trabaje quien trabaje.
  // Recortarla a los presentes bajaría el listón según quién descanse ese día.
  const tienda = resumirTienda(
    [
      fila({ userId: "u1", nombre: "Itzel", venta: 6120, meta: 7000 }),
      fila({ userId: "u2", nombre: "Waira", meta: 7000 }),
      fila({ userId: "yo", nombre: "Jesús", venta: 1910, meta: 2718.36 })
    ],
    "yo",
    enTurnoHoy(HORARIO)
  );
  assert.equal(tienda?.meta, 16718.36);
});

test("⚠️ quien VENDIÓ sale aunque su horario diga que descansa", () => {
  // Una venta que existe tiene que verse: es lo único que mantiene la suma de
  // las filas visibles cuadrando con el total de arriba, y un descuadre de
  // horario hay que corregirlo, no esconderlo.
  const filas = [
    fila({ userId: "u1", nombre: "Itzel", venta: 6120, tickets: 12, piezas: 21 }),
    fila({ userId: "u2", nombre: "Waira", venta: 900, tickets: 2, piezas: 3 }),
    fila({ userId: "yo", nombre: "Jesús", venta: 1910, tickets: 4, piezas: 7 })
  ];
  const tienda = resumirTienda(filas, "yo", enTurnoHoy(HORARIO));
  assert.ok(tienda?.personas.some((p) => p.nombre === "Waira"), "Waira vendió y no puede desaparecer");
  const suma = tienda!.personas.reduce((acc, p) => acc + p.venta, 0);
  assert.equal(suma, tienda?.venta);
});

test("⚠️ el CONTEO cuenta como estar en turno", () => {
  // Ese día venden y tienen meta, igual que cualquier otro. Es el mismo
  // criterio de `lib/working-today.ts`.
  const enTurno = enTurnoHoy([{ userId: "u1", status: "INVENTORY" }, { userId: "u2", status: "VACATION" }]);
  assert.equal(enTurno?.has("u1"), true);
  assert.equal(enTurno?.has("u2"), false);
});

test("⚠️ sin horario cargado NO se filtra a nadie", () => {
  // Un horario que aún no se ha capturado no es «no trabaja nadie». Filtrando
  // por él, la tarjeta se vaciaría justo los días en que gerencia todavía no lo
  // ha subido, que es cuando más se mira.
  assert.equal(enTurnoHoy([]), null);
  const tienda = resumirTienda(EQUIPO, "yo", enTurnoHoy([]));
  assert.equal(tienda?.personas.length, 3);
});

test("⚠️ el endpoint pasa el horario del día a resumirTienda", () => {
  // Sin esta línea todo lo de arriba queda escrito y sin usar: la pantalla
  // seguiría enseñando al equipo entero y las pruebas en verde.
  const ruta = join(__dirname, "..", "app", "api", "app", "native", "my-day", "route.ts");
  const codigo = readFileSync(ruta, "utf8");
  assert.match(codigo, /enTurnoHoy\(horariosDeHoy\)/);
  assert.match(codigo, /prisma\.schedule\.findMany/);
});
