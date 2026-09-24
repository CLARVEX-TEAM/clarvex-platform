import assert from "node:assert/strict";
import test from "node:test";
import { ROUTES_WITH_NAV } from "../components/AppChrome";
import { navItems } from "../components/ui/LiquidBottomNav";
import {
  ACCESOS_ASESOR,
  ACCESOS_GERENCIA,
  DESTACADOS_MI_DIA,
  accesosSecundarios
} from "../lib/accesos-telefono";

/*
 * Por qué existen estas pruebas.
 *
 * ⚠️ **Una pantalla sin puerta de entrada no da error.** Está entera, compila,
 * responde si escribes su dirección, e incluso pinta su barra inferior. Lo
 * único que le falta es que alguien pueda llegar a ella, y eso no lo detecta
 * ningún tipo, ningún lint y ninguna prueba de la propia pantalla.
 *
 * Pasó el 17 de septiembre de 2026: «Mi día» sustituyó a `/advisor` y
 * `/manager` dentro de la APK, y con ellas se fue `QuickActions`, la rejilla que
 * era la ÚNICA entrada a ocho pantallas —Bitácora, Reconocer, Asistencia, Días
 * y cambios, Faltantes, Capacitación, Encuestas y Suscripción— más Equipo, que
 * colgaba de un botón suelto de `/manager`. Todas siguieron existiendo y nadie
 * podía abrirlas. Lo reportó el gerente usando la app.
 *
 * La regla que comprueban: **toda ruta que lleva barra inferior es una pantalla
 * del teléfono, y toda pantalla del teléfono tiene por dónde entrar.**
 */

/** La campana y el avatar del encabezado (`components/ui/AppHeader.tsx`). */
const DESDE_EL_ENCABEZADO = ["/notificaciones", "/perfil"];

/**
 * Las portadas. No necesitan acceso porque SON el destino del botón de inicio:
 * `/mi-dia` dentro de la APK, `/advisor` o `/manager` fuera.
 */
const PORTADAS = ["/mi-dia", "/advisor", "/manager"];

/**
 * Rutas que se abren desde su pantalla padre, no desde la portada. Cada una con
 * el motivo: si mañana alguien quita ese camino, que al menos esté escrito cuál
 * era.
 */
const DESDE_SU_PADRE: Record<string, string> = {
  "/checklist/config": "se configura desde /checklist",
  "/conteos/marbetes": "se abre desde /conteos",
  "/admin": "administración de TODAS las tiendas; se entra desde el escritorio, no es una herramienta del día"
};

function todasLasEntradas(): Set<string> {
  return new Set([
    ...navItems.map((item) => item.href),
    ...DESDE_EL_ENCABEZADO,
    ...PORTADAS,
    ...DESTACADOS_MI_DIA,
    ...ACCESOS_GERENCIA.map((a) => a.href),
    ...ACCESOS_ASESOR.map((a) => a.href),
    ...Object.keys(DESDE_SU_PADRE)
  ]);
}

test("ninguna pantalla del telefono se queda sin puerta de entrada", () => {
  const entradas = todasLasEntradas();
  const huerfanas = [...ROUTES_WITH_NAV].filter((ruta) => !entradas.has(ruta));

  assert.deepEqual(
    huerfanas,
    [],
    `Estas pantallas llevan barra inferior y no se puede llegar a ellas:\n${huerfanas.join("\n")}\n` +
      "Agrégalas a lib/accesos-telefono.ts, o si se abren desde otra pantalla, documenta el camino en DESDE_SU_PADRE."
  );
});

test("ningun acceso apunta a una pantalla que no existe", () => {
  // El fallo espejo: un acceso a una ruta retirada o mal escrita se ve bien en
  // la rejilla y da 404 al tocarlo, que es peor que no ofrecerlo.
  const rotos = [...ACCESOS_GERENCIA, ...ACCESOS_ASESOR]
    .map((accion) => accion.href)
    .filter((href) => !ROUTES_WITH_NAV.has(href));

  assert.deepEqual(rotos, [], `Accesos que no llevan a ninguna pantalla del teléfono:\n${rotos.join("\n")}`);
});

test("las pantallas que se perdieron y siguen vivas tienen entrada", () => {
  // Nombradas una a una a propósito: son el caso real que originó la prueba.
  // Las otras siete de aquella lista se cerraron a propósito con el plan de
  // apagado; ver la prueba siguiente.
  const gerencia = new Set(ACCESOS_GERENCIA.map((a) => a.href));
  for (const ruta of ["/asistencia", "/equipo"]) {
    assert.ok(gerencia.has(ruta), `${ruta} sigue sin acceso para gerencia`);
  }
});

test("las quince pantallas del plan de apagado no tienen ninguna puerta", () => {
  // Fase 2 (24 de septiembre de 2026). Si alguien reclama una, se devuelve
  // revirtiendo el cambio, y esta prueba se actualiza con él.
  const cerradas = [
    "/capacitacion", "/encuestas", "/kudos", "/bitacora", "/uniformes", "/solicitudes", "/faltantes", "/plan",
    "/pendientes", "/comunicados", "/suscripcion", "/dispositivos", "/chat", "/soporte", "/credencial"
  ];
  const entradas = todasLasEntradas();
  const abiertas = cerradas.filter((ruta) => entradas.has(ruta));
  assert.deepEqual(abiertas, [], `Estas pantallas cerradas siguen teniendo entrada:\n${abiertas.join("\n")}`);
});

test("el asesor no ve los accesos de gerencia", () => {
  const delAsesor = new Set(ACCESOS_ASESOR.map((a) => a.href));
  // El reparto es el mismo que llevaba la portada anterior en producción.
  for (const soloGerencia of ["/equipo"]) {
    assert.equal(delAsesor.has(soloGerencia), false, `${soloGerencia} no debería estar en la lista del asesor`);
  }
});

test("los destacados de Mi dia no se repiten abajo", () => {
  const secundarios = accesosSecundarios("GERENTE", true, DESTACADOS_MI_DIA).map((a) => a.href);
  for (const destacado of DESTACADOS_MI_DIA) {
    assert.equal(secundarios.includes(destacado), false, `${destacado} aparecería dos veces en la misma pantalla`);
  }
  // Y el resto sí baja: sin esto, excluir de más pasaría desapercibido.
  assert.ok(secundarios.includes("/asistencia"));
  assert.ok(secundarios.includes("/equipo"));
});

test("KPIs desaparece de los accesos cuando la tienda lo tiene apagado", () => {
  const conKpis = accesosSecundarios("ASESOR", true, DESTACADOS_MI_DIA).map((a) => a.href);
  const sinKpis = accesosSecundarios("ASESOR", false, DESTACADOS_MI_DIA).map((a) => a.href);
  assert.ok(conKpis.includes("/kpis"));
  assert.equal(sinKpis.includes("/kpis"), false);
  // Apagar KPIs no puede llevarse nada más por delante.
  assert.equal(sinKpis.length, conKpis.length - 1);
});
