import assert from "node:assert/strict";
import test from "node:test";
import { showsBottomNav } from "../components/AppChrome";

/**
 * La barra pasó de renderizarse en cada página a montarse una vez en el layout.
 * Lo único que decide dónde aparece es esta regla, así que un fallo aquí la pone
 * encima del login o tapando una conversación. Las parejas que se parecen y se
 * comportan distinto son el motivo de que la lista sea explícita.
 */

test("las pantallas de la app movil la llevan", () => {
  for (const ruta of ["/manager", "/advisor", "/mi-dia", "/horarios", "/asistencia", "/kpis", "/conteos", "/checklist", "/perfil"]) {
    assert.equal(showsBottomNav(ruta), true, `${ruta} deberia llevar barra`);
  }
});

test("el escritorio NO la lleva: tiene su propia navegacion lateral", () => {
  for (const ruta of ["/escritorio", "/escritorio/kpis", "/escritorio/plan", "/escritorio/chat"]) {
    assert.equal(showsBottomNav(ruta), false, `${ruta} no deberia llevar barra`);
  }
});

test("el login y las paginas publicas NO la llevan", () => {
  for (const ruta of ["/", "/login", "/suspendida", "/mantenimiento", "/terminos", "/privacidad", "/cookies", "/recuperar", "/reset", "/regional"]) {
    assert.equal(showsBottomNav(ruta), false, `${ruta} no deberia llevar barra`);
  }
});

test("las pantallas cerradas por el plan de apagado ya NO la llevan", () => {
  // Fase 2 (24 de septiembre de 2026): siguen existiendo, pero sin puerta. Si
  // una vuelve a llevar barra, tiene que volver también a tener entrada.
  for (const ruta of [
    "/bitacora", "/capacitacion", "/chat", "/comunicados", "/credencial", "/encuestas", "/faltantes",
    "/kudos", "/dispositivos", "/pendientes", "/plan", "/solicitudes", "/soporte", "/suscripcion", "/uniformes"
  ]) {
    assert.equal(showsBottomNav(ruta), false, `${ruta} no deberia llevar barra`);
  }
  assert.equal(showsBottomNav("/chat/abc123"), false);
});

test("el detalle de un conteo la lleva; la vista de imprimir no", () => {
  assert.equal(showsBottomNav("/conteos"), true);
  assert.equal(showsBottomNav("/conteos/cmq123abc"), true, "detalle de un conteo");
  assert.equal(showsBottomNav("/conteos/marbetes"), true);
  assert.equal(showsBottomNav("/conteos/marbetes/imprimir"), false, "vista de impresion");
});

test("una ruta inventada no la lleva", () => {
  // Una pagina nueva no hereda la barra: hay que anadirla a la lista. Es el
  // error menos malo de los dos.
  assert.equal(showsBottomNav("/pantalla-que-no-existe"), false);
  assert.equal(showsBottomNav(""), false);
});
