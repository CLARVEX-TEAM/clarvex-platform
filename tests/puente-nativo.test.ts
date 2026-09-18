import assert from "node:assert/strict";
import test from "node:test";
import { enContenedorNativo, rutaDeInicio } from "../lib/puente-nativo";

/*
 * Por qué existen estas pruebas.
 *
 * ⚠️ **El fallo que cubren solo pasa en el ARRANQUE EN FRÍO y no da error.**
 * `window.Capacitor` lo inyecta el contenedor al empezar el documento; si la
 * raíz de la app pregunta antes de que llegue, contesta «no soy la app» y manda
 * a `/manager` --la portada de la WEB-- dentro de la APK. La persona ve la
 * interfaz equivocada, cambia de pantalla y vuelve, y entonces ya carga bien.
 *
 * Reportado el 18 de septiembre de 2026, y confirmado en el registro del proxy
 * con la misma marca de segundo: `"/"` seguido de `"/manager"` desde un
 * User-Agent `ClarvexApp/1.6`.
 *
 * La segunda señal --la marca del agente-- no puede llegar tarde: la fija el
 * WebView antes de cargar nada.
 */

const UA_APP = "Mozilla/5.0 (Linux; Android 17; Pixel 9 Pro XL; wv) AppleWebKit/537.36 ClarvexApp/1.6";
const UA_CHROME = "Mozilla/5.0 (Linux; Android 17; Pixel 9 Pro XL) AppleWebKit/537.36 Chrome/141.0.0.0 Mobile Safari/537.36";

/** Monta un `window`/`navigator` de mentira y devuelve cómo deshacerlo. */
function entorno({ puente, agente }: { puente?: unknown; agente?: string }): () => void {
  const previoWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previoNav = Object.getOwnPropertyDescriptor(globalThis, "navigator");

  Object.defineProperty(globalThis, "window", {
    value: puente === undefined ? {} : { Capacitor: puente },
    configurable: true,
    writable: true
  });
  Object.defineProperty(globalThis, "navigator", {
    value: { userAgent: agente ?? UA_CHROME },
    configurable: true,
    writable: true
  });

  return () => {
    if (previoWindow) Object.defineProperty(globalThis, "window", previoWindow);
    else delete (globalThis as Record<string, unknown>).window;
    if (previoNav) Object.defineProperty(globalThis, "navigator", previoNav);
    else delete (globalThis as Record<string, unknown>).navigator;
  };
}

test("con el puente ya puesto, dice que si", () => {
  const deshacer = entorno({ puente: { isNativePlatform: () => true }, agente: UA_APP });
  try {
    assert.equal(enContenedorNativo(), true);
  } finally {
    deshacer();
  }
});

test("EL CASO DEL ARRANQUE: sin puente todavia, la marca del agente lo salva", () => {
  // Es exactamente el estado en el que la raíz decidía mal: el contenedor ya
  // cargó la página pero aún no inyectó `window.Capacitor`.
  const deshacer = entorno({ agente: UA_APP });
  try {
    assert.equal(enContenedorNativo(), true, "la APK tiene que reconocerse antes de que llegue el puente");
  } finally {
    deshacer();
  }
});

test("la marca se compara por PREFIJO: sirve para toda APK instalada", () => {
  // Cada versión escribe la suya. Buscar una exacta dejaría fuera a quien no se
  // haya actualizado — que son justo los teléfonos que no se pueden arreglar
  // publicando una APK nueva.
  for (const version of ["1.3", "1.4", "1.5", "1.5.1", "1.6", "2.0"]) {
    const deshacer = entorno({ agente: `Mozilla/5.0 (Linux; Android 17; wv) ClarvexApp/${version}` });
    try {
      assert.equal(enContenedorNativo(), true, `ClarvexApp/${version} es la app`);
    } finally {
      deshacer();
    }
  }
});

test("el navegador normal y la PWA siguen siendo web", () => {
  const deshacer = entorno({ agente: UA_CHROME });
  try {
    assert.equal(enContenedorNativo(), false);
  } finally {
    deshacer();
  }
});

test("un puente que dice que NO manda sobre el agente ausente", () => {
  const deshacer = entorno({ puente: { isNativePlatform: () => false }, agente: UA_CHROME });
  try {
    assert.equal(enContenedorNativo(), false);
  } finally {
    deshacer();
  }
});

test("fuera del navegador no revienta", () => {
  // Se ejecuta en el servidor al renderizar: sin `window` ni `navigator` tiene
  // que contestar «web» y no lanzar.
  assert.equal(enContenedorNativo(), false);
});

test("el boton de inicio lleva a Mi dia dentro de la APK", () => {
  const deshacer = entorno({ agente: UA_APP });
  try {
    assert.equal(rutaDeInicio("/manager"), "/mi-dia");
    assert.equal(rutaDeInicio("/advisor"), "/mi-dia");
  } finally {
    deshacer();
  }
});

test("en la web el boton de inicio no se toca", () => {
  const deshacer = entorno({ agente: UA_CHROME });
  try {
    assert.equal(rutaDeInicio("/manager"), "/manager");
    assert.equal(rutaDeInicio("/advisor"), "/advisor");
  } finally {
    deshacer();
  }
});

test("cualquier otro destino se respeta, dentro y fuera", () => {
  // Un «atrás» que lleva a la pantalla padre no tiene nada que ver con la
  // portada: traducirlo movería a la gente a otra pantalla sin motivo.
  for (const agente of [UA_APP, UA_CHROME]) {
    const deshacer = entorno({ agente });
    try {
      assert.equal(rutaDeInicio("/conteos"), "/conteos");
      assert.equal(rutaDeInicio("/checklist"), "/checklist");
    } finally {
      deshacer();
    }
  }
});
