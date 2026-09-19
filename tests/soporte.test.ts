import assert from "node:assert/strict";
import test from "node:test";
import {
  admiteRespuesta,
  comoSeDice,
  estadoDesdeZendesk,
  folioDe,
  hace,
  mensajesVisibles,
  minutosHastaLaPrimeraRespuesta
} from "../lib/soporte";

/*
 * Por qué existen estas pruebas.
 *
 * ⚠️ **El fallo caro de esta pantalla es enseñar una NOTA INTERNA.** Zendesk las
 * marca con `public:false` y son donde los agentes hablan entre ellos sobre el
 * caso --y a veces sobre quien lo abrió--. Filtrada mal, se vería como un
 * mensaje más: sin error, sin registro, y la persona leyendo algo que no era
 * para ella. Es exactamente la forma de fallo que este repositorio persigue.
 */

test("⚠️ una NOTA INTERNA no se enseña JAMAS", () => {
  const visibles = mensajesVisibles(
    [
      { public: true, body: "Hola, ya lo estamos viendo.", created_at: "2026-09-19T10:00:00Z", author_id: 7 },
      { public: false, body: "Ojo, este usuario ya reportó tres veces lo mismo.", created_at: "2026-09-19T10:01:00Z", author_id: 7 },
      { public: true, body: "Listo, quedó arreglado.", created_at: "2026-09-19T11:00:00Z", author_id: 7 }
    ],
    [42]
  );

  assert.equal(visibles.length, 2);
  for (const mensaje of visibles) {
    assert.doesNotMatch(mensaje.texto, /tres veces/, "se filtró una nota interna");
  }
});

test("⚠️ se decide por `public`, NO por quien lo escribio", () => {
  /*
   * El mismo agente escribe en público y, dos minutos después, una nota interna.
   * Filtrar por autor dejaría pasar la segunda.
   */
  const mismoAgente = 7;
  const visibles = mensajesVisibles(
    [
      { public: true, body: "Respuesta pública", created_at: "a", author_id: mismoAgente },
      { public: false, body: "Nota interna", created_at: "b", author_id: mismoAgente }
    ],
    [99]
  );
  assert.deepEqual(visibles.map((m) => m.texto), ["Respuesta pública"]);
});

test("un comentario sin `public` no se da por publico", () => {
  // Ausente no es `true`. Ante la duda, no se enseña.
  const visibles = mensajesVisibles([{ body: "sin bandera", created_at: "a" }], [1]);
  assert.deepEqual(visibles, []);
});

test("los vacios no ocupan sitio en la conversacion", () => {
  const visibles = mensajesVisibles(
    [
      { public: true, body: "   ", created_at: "a" },
      { public: true, created_at: "b" },
      { public: true, body: "de verdad", created_at: "c" }
    ],
    [1]
  );
  assert.deepEqual(visibles.map((m) => m.texto), ["de verdad"]);
});

test("se distingue lo que escribio la persona de lo que contesto soporte", () => {
  const visibles = mensajesVisibles(
    [
      { public: true, body: "No me abre la cámara", created_at: "a", author_id: 42 },
      { public: true, body: "Ya lo vemos", created_at: "b", author_id: 7 }
    ],
    [42]
  );
  assert.deepEqual(visibles.map((m) => m.mio), [true, false]);
});

test("⚠️ «mio» son VARIAS identidades, no una", () => {
  /*
   * Quien tiene correo real queda registrado en Zendesk como solicitante y sus
   * mensajes van a su nombre. Quien tiene el correo inventado `@clarvex.local`
   * --once de dieciocho-- no existe allí, así que lo suyo se publica a nombre de
   * la cuenta de API de Clarvex.
   *
   * Con una sola identidad, la mitad de los casos pintaría la conversación al
   * revés: la persona leyendo sus propias palabras como si se las hubiera dicho
   * soporte. No daría ningún error.
   */
  const CUENTA_API = 500;
  const PERSONA = 42;
  const AGENTE = 7;

  // Caso de quien SÍ tiene correo real: su primer mensaje va a su nombre.
  const conCorreo = mensajesVisibles(
    [
      { public: true, body: "No me abre la cámara", created_at: "a", author_id: PERSONA },
      { public: true, body: "Ya lo vemos", created_at: "b", author_id: AGENTE }
    ],
    [CUENTA_API, PERSONA]
  );
  assert.deepEqual(conCorreo.map((m) => m.mio), [true, false]);

  // Caso del correo inventado: lo suyo sale a nombre de la cuenta de API.
  const sinCorreo = mensajesVisibles(
    [
      { public: true, body: "No me abre la cámara", created_at: "a", author_id: CUENTA_API },
      { public: true, body: "Ya lo vemos", created_at: "b", author_id: AGENTE }
    ],
    [CUENTA_API, null]
  );
  assert.deepEqual(sinCorreo.map((m) => m.mio), [true, false], "el correo inventado pinta al revés");
});

test("⚠️ un estado DESCONOCIDO de Zendesk no se traduce como resuelto", () => {
  /*
   * Zendesk puede agregar estados. Una traducción optimista por omisión diría
   * «resuelto» sobre algo que sigue abierto, y la persona dejaría de esperar
   * respuesta.
   */
  assert.equal(estadoDesdeZendesk("algo_nuevo_de_zendesk"), "en-curso");
  assert.equal(estadoDesdeZendesk(null), "en-curso");
  assert.equal(estadoDesdeZendesk(undefined), "en-curso");
  assert.equal(estadoDesdeZendesk(""), "en-curso");
});

test("`solved` y `closed` se dicen igual", () => {
  // Para Zendesk son distintos; para quien reportó, las dos son «ya está».
  assert.equal(estadoDesdeZendesk("solved"), "resuelto");
  assert.equal(estadoDesdeZendesk("CLOSED"), "resuelto");
  assert.equal(comoSeDice("resuelto").tono, "bien");
});

test("«esperando» avisa que la pelota es de la persona", () => {
  assert.equal(estadoDesdeZendesk("pending"), "esperando");
  assert.equal(comoSeDice("esperando").tono, "aviso");
  assert.match(comoSeDice("esperando").texto, /tu respuesta/i);
});

test("un caso resuelto ya no admite respuesta; los demas si", () => {
  assert.equal(admiteRespuesta("resuelto"), false);
  for (const estado of ["nuevo", "en-curso", "esperando"] as const) {
    assert.equal(admiteRespuesta(estado), true, estado);
  }
});

test("⚠️ el folio se DERIVA del id de Zendesk", () => {
  /*
   * Un contador propio se separaría del suyo en cuanto se creara un ticket por
   * fuera --por correo, por teléfono-- y el mismo caso tendría dos nombres.
   */
  assert.equal(folioDe(1), "CS-00001");
  assert.equal(folioDe(48231), "CS-48231");
  assert.equal(folioDe(1234567), "CS-1234567", "un id grande no se recorta");
  // Un id imposible no produce un folio bonito y falso.
  for (const malo of [0, -3, 1.5, NaN]) {
    assert.throws(() => folioDe(malo), /inválido/, String(malo));
  }
});

test("⚠️ sin respuesta todavia, la atencion es `null` y NO cero", () => {
  /*
   * Un cero se lee como «contestaron al instante», que es justo lo contrario.
   * Mismo error que confundir «no hay medición» con «está sano».
   */
  const abierto = new Date("2026-09-19T10:00:00Z");
  assert.equal(minutosHastaLaPrimeraRespuesta(abierto, null), null);
  assert.equal(minutosHastaLaPrimeraRespuesta(abierto, undefined), null);
  assert.equal(minutosHastaLaPrimeraRespuesta(abierto, new Date("2026-09-19T10:45:00Z")), 45);
});

test("un reloj desajustado no produce una atencion negativa", () => {
  const abierto = new Date("2026-09-19T10:00:00Z");
  assert.equal(minutosHastaLaPrimeraRespuesta(abierto, new Date("2026-09-19T09:50:00Z")), 0);
});

test("«hace» se lee en la lista de casos", () => {
  const ahora = new Date("2026-09-19T12:00:00Z");
  assert.equal(hace(new Date("2026-09-19T11:59:40Z"), ahora), "ahora");
  assert.equal(hace(new Date("2026-09-19T11:30:00Z"), ahora), "hace 30 min");
  assert.equal(hace(new Date("2026-09-19T09:00:00Z"), ahora), "hace 3 h");
  assert.equal(hace(new Date("2026-09-18T12:00:00Z"), ahora), "hace 1 día");
  assert.equal(hace(new Date("2026-09-15T12:00:00Z"), ahora), "hace 4 días");
  // Un reloj adelantado no dice «hace -5 min».
  assert.equal(hace(new Date("2026-09-19T12:05:00Z"), ahora), "ahora");
});
