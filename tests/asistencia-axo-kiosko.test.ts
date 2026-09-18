import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { puedeConAsistenciaAxo } from "../lib/operational-checklist-reminders";

/*
 * Por qué existen estas pruebas.
 *
 * El gerente pidió que la asistencia de AXO y su botón del Forms aparecieran
 * también en el KIOSKO: es el teléfono que está a la mano cuando se abre la
 * tienda, que es justo cuando hay que pasar la lista.
 *
 * ⚠️ **Es un cambio de permisos sobre la cuenta más restringida que existe.**
 * El kiosko está encerrado en el middleware a propósito, y tiene rol `ASESOR`:
 * abrirle esto por ROL se lo daría de paso a todo el equipo. Por eso la
 * condición mira `checklistOnly` y no el puesto, y por eso la ruta se permite
 * EXACTA y no por prefijo.
 */

/**
 * Quita comentarios antes de mirar el código.
 *
 * ⚠️ Sin esto, la prueba se tropieza con la PROSA. Pasó al escribirla: el
 * comentario del middleware cita `startsWith("/api/attendance")` como ejemplo
 * de lo que NO hay que hacer, y la comprobación lo leyó como si fuera código.
 * Una prueba que falla por un comentario enseña a ignorarla.
 */
function sinComentarios(fuente: string): string {
  return fuente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

test("ve la asistencia quien tiene que verla", () => {
  assert.equal(puedeConAsistenciaAxo({ role: "GERENTE" }), true);
  assert.equal(puedeConAsistenciaAxo({ role: "SUBGERENTE" }), true);
  assert.equal(puedeConAsistenciaAxo({ role: "ASESOR", checklistOnly: true }), true, "el teléfono de la tienda");
  assert.equal(puedeConAsistenciaAxo({ role: "ASESOR", platformAdmin: true }), true);
});

test("⚠️ un asesor normal NO la ve", () => {
  /*
   * Este es el filo del cambio. El kiosko tiene rol `ASESOR`, así que un
   * `requireSession(["GERENTE","SUBGERENTE","ASESOR"])` habría cumplido la
   * petición y de paso habría enseñado la asistencia de todo el equipo a cada
   * asesor. La diferencia está en `checklistOnly`, no en el puesto.
   */
  assert.equal(puedeConAsistenciaAxo({ role: "ASESOR" }), false);
  assert.equal(puedeConAsistenciaAxo({ role: "ASESOR", checklistOnly: false }), false);
});

test("⚠️ el middleware abre la ruta EXACTA, nunca el prefijo", () => {
  /*
   * `startsWith("/api/attendance")` habría abierto de paso
   * `/api/attendance-capture` --que escribe el banco de minutos, o sea el
   * sueldo-- al aparato menos protegido de la tienda. El símbolo de que está
   * bien es el `===`, no el `startsWith`.
   */
  const fuente = sinComentarios(readFileSync("middleware.ts", "utf8"));
  assert.match(fuente, /pathname === "\/api\/attendance-axo"/, "la ruta se compara exacta");
  assert.equal(
    /startsWith\("\/api\/attendance/.test(fuente),
    false,
    "abrir el prefijo dejaría entrar a la captura de asistencia"
  );
});

test("el servidor decide con el mismo criterio que la pantalla", () => {
  // Si el endpoint volviera a filtrar por rol, el kiosko vería la tarjeta y
  // recibiría un 403 al tocarla: peor que no verla.
  const endpoint = sinComentarios(readFileSync("app/api/attendance-axo/route.ts", "utf8"));
  assert.equal((endpoint.match(/puedeConAsistenciaAxo\(session\)/g) ?? []).length, 2, "las DOS puertas, GET y POST");
  assert.equal(/requireSession\(\[\.\.\.MANAGER_ROLES\]\)/.test(endpoint), false, "ya no filtra por puesto");

  const pantalla = sinComentarios(readFileSync("app/checklist/page.tsx", "utf8"));
  assert.match(pantalla, /puedeConAsistenciaAxo\(session\)/, "la pantalla usa el mismo criterio");
  assert.equal(
    /session\.role === "GERENTE" \|\| session\.role === "SUBGERENTE"/.test(pantalla),
    false,
    "quedaría una comprobación de rol paralela que se separaría de la otra"
  );
});
