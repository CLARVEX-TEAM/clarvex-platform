import assert from "node:assert/strict";
import test from "node:test";
import { aQuienAvisar, encontrarMenciones, nombresMencionables, TODOS } from "../lib/chat-mentions";
import { filtrarSugerencias, mencionEnCurso } from "../components/ChatMentions";

const EQUIPO = [
  { userId: "itzel", name: "ITZEL SAIDY REYES BAUTISTA" },
  { userId: "adrian", name: "JESUS ADRIAN HERNANDEZ LUNA" },
  { userId: "waira", name: "WAIRA ZITLALI POPOCA" },
  { userId: "jazmin", name: "JAZMIN CASTRO ZUÑIGA" },
  { userId: "alonso", name: "ALONSO TREVIÑO" }
];
const TODOS_IDS = EQUIPO.map((p) => p.userId);

test("menciona por el primer nombre", () => {
  const m = encontrarMenciones("@Waira revisa el marbete 12", EQUIPO);
  assert.equal(m.length, 1);
  assert.equal(m[0].userId, "waira");
  assert.equal(m[0].escrito, "@Waira");
});

test("los acentos y las mayusculas dan igual", () => {
  assert.equal(encontrarMenciones("ojo @jazmín", EQUIPO)[0]?.userId, "jazmin");
  assert.equal(encontrarMenciones("ojo @ALONSO", EQUIPO)[0]?.userId, "alonso");
  assert.equal(encontrarMenciones("ojo @treviño", EQUIPO)[0]?.userId, undefined);
});

test("varias menciones en un mensaje", () => {
  const m = encontrarMenciones("@Waira y @Alonso cierran hoy", EQUIPO);
  assert.deepEqual(m.map((x) => x.userId), ["waira", "alonso"]);
});

test("la misma persona dos veces se cuenta una", () => {
  const m = encontrarMenciones("@Waira, oye @Waira", EQUIPO);
  assert.equal(m.length, 1);
});

test("un nombre que no existe no menciona a nadie", () => {
  assert.deepEqual(encontrarMenciones("@Fulano ven", EQUIPO), []);
  assert.deepEqual(encontrarMenciones("correo@dominio.com", EQUIPO), []);
});

test("@todos avisa a la sala entera menos a quien escribe", () => {
  const r = aQuienAvisar("@todos junta a las 9", EQUIPO, "itzel", TODOS_IDS);
  assert.equal(r.aTodos, true);
  assert.deepEqual(r.userIds.sort(), ["adrian", "alonso", "jazmin", "waira"]);
});

test("⚠️ nunca se avisa a quien escribe", () => {
  // Mencionarse a uno mismo pasa al releer lo que escribiste, y un aviso de tu
  // propio mensaje solo enseña a ignorarlos.
  const r = aQuienAvisar("@Waira lo dejo hecho", EQUIPO, "waira", TODOS_IDS);
  assert.deepEqual(r.userIds, []);
});

test("no se avisa a quien no esta en la sala", () => {
  const r = aQuienAvisar("@Alonso ven", EQUIPO, "itzel", ["itzel", "waira"]);
  assert.deepEqual(r.userIds, []);
});

/* ─── el caso que puede avisar a quien no era ─────────────────────────────── */

test("⚠️ dos personas con el MISMO primer nombre no se mencionan a medias", () => {
  // Es la regla del lector del POS: elegir mal avisaria a quien no era, y en un
  // chat de trabajo eso es peor que no avisar.
  const conRepetido = [
    ...EQUIPO,
    { userId: "ana1", name: "ANA SOFIA MONTALVO" },
    { userId: "ana2", name: "ANA LUISA GARCIA" }
  ];
  assert.deepEqual(encontrarMenciones("@Ana ven", conRepetido), [], "«@Ana» no puede decidir cual");
  // Con dos palabras si se distingue.
  assert.equal(encontrarMenciones("@Ana Sofia ven", conRepetido)[0]?.userId, "ana1");
  assert.equal(encontrarMenciones("@Ana Luisa ven", conRepetido)[0]?.userId, "ana2");
});

test("dos palabras ganan sobre una cuando ambas valen", () => {
  const m = encontrarMenciones("@Waira Zitlali revisa", EQUIPO);
  assert.equal(m[0]?.userId, "waira");
  assert.equal(m[0]?.escrito, "@Waira Zitlali");
});

test("el mapa de nombres deja fuera los ambiguos", () => {
  const nombres = nombresMencionables([
    { userId: "a", name: "ANA SOFIA MONTALVO" },
    { userId: "b", name: "ANA LUISA GARCIA" }
  ]);
  assert.equal(nombres.get("ana"), undefined);
  assert.equal(nombres.get("ana sofia"), "a");
  assert.equal(nombres.get("ana luisa"), "b");
});

test("TODOS es una palabra reservada, no una persona", () => {
  assert.equal(encontrarMenciones("@todos", EQUIPO)[0]?.userId, TODOS);
});

/* ─── el autocompletado ───────────────────────────────────────────────────── */

test("detecta que se esta escribiendo una mencion", () => {
  assert.deepEqual(mencionEnCurso("hola @wa", 8), { desde: 5, termino: "wa" });
  assert.deepEqual(mencionEnCurso("@", 1), { desde: 0, termino: "" });
});

test("⚠️ un correo no abre el autocompletado", () => {
  // «correo@dominio.com» no es una mencion, y sugerir ahi seria molesto.
  assert.equal(mencionEnCurso("escribe a correo@dominio", 24), null);
});

test("fuera de una mencion no sugiere nada", () => {
  assert.equal(mencionEnCurso("hola equipo", 11), null);
  assert.equal(mencionEnCurso("@waira ya cerre la tienda", 25), null);
});

test("sugiere por cualquier parte del nombre, y nunca a uno mismo", () => {
  const gente = EQUIPO.map((p) => ({ ...p, photoUrl: null }));
  assert.deepEqual(filtrarSugerencias(gente, "wa", "itzel").map((p) => p.userId), ["waira"]);
  // Por apellido tambien: se escribe lo que uno recuerda.
  assert.deepEqual(filtrarSugerencias(gente, "trevi", "itzel").map((p) => p.userId), ["alonso"]);
  assert.ok(!filtrarSugerencias(gente, "", "itzel").some((p) => p.userId === "itzel"));
});

test("con nombre y espacio sigue sugiriendo; con la frase empezada, no", () => {
  // Tras «@Ana » puede venir el apellido, asi que la lista sigue.
  assert.deepEqual(mencionEnCurso("hola @Ana ", 10), { desde: 5, termino: "Ana " });
  assert.deepEqual(mencionEnCurso("hola @Ana Sofia", 15), { desde: 5, termino: "Ana Sofia" });
  // Pero tras el segundo nombre la mencion termino.
  assert.equal(mencionEnCurso("hola @Ana Sofia ", 16), null);
});
