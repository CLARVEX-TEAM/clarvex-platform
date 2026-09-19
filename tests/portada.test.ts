import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { globSync } from "node:fs";
import { debeIrAMiDia, portadaDe } from "../lib/portada";

/*
 * Por qué existen estas pruebas.
 *
 * ⚠️ **Es la SEGUNDA vez que se reporta el mismo fallo el mismo día.** «Cuando
 * recién entro me aparece la interfaz de inicio que era exclusiva para la web.»
 * La primera corrección arregló la raíz y los botones de volver --los orígenes--
 * y dejó fuera el login, que también manda a `/manager`.
 *
 * Arreglar orígenes no escala: hay más de veinte sitios que enlazan ahí. La
 * prueba de abajo es la que habría atrapado esto, porque no comprueba el arreglo
 * sino que NADIE se salte la regla.
 */

test("dentro de la app se entra por «Mi día», sea cual sea el puesto", () => {
  assert.equal(portadaDe({ role: "GERENTE" }, true), "/mi-dia");
  assert.equal(portadaDe({ role: "SUBGERENTE" }, true), "/mi-dia");
  assert.equal(portadaDe({ role: "ASESOR" }, true), "/mi-dia");
});

test("fuera de la app cada quien conserva su portada de siempre", () => {
  assert.equal(portadaDe({ role: "GERENTE" }, false), "/manager");
  assert.equal(portadaDe({ role: "SUBGERENTE" }, false), "/manager");
  assert.equal(portadaDe({ role: "ASESOR" }, false), "/advisor");
});

test("⚠️ el kiosko va a Checklist, y se decide ANTES de mirar si es la app", () => {
  /*
   * El celular de la tienda está dado de alta con rol `ASESOR`, así que
   * cualquier reparto por puesto se lo lleva a la portada de asesor. Ya se coló
   * en doce consultas por ese mismo motivo.
   */
  assert.equal(portadaDe({ role: "ASESOR", checklistOnly: true }, true), "/checklist");
  assert.equal(portadaDe({ role: "ASESOR", checklistOnly: true }, false), "/checklist");
});

test("la guarda del destino dice lo mismo que el reparto", () => {
  assert.equal(debeIrAMiDia({ role: "GERENTE" }, true), true);
  assert.equal(debeIrAMiDia({ role: "GERENTE" }, false), false);
  assert.equal(debeIrAMiDia({ role: "ASESOR", checklistOnly: true }, true), false, "el kiosko no pasa por Mi día");
});

/**
 * Quita comentarios para no tropezar con los ejemplos escritos en la propia
 * documentación del código. Ya pasó con otra prueba de este repositorio.
 */
function sinComentarios(fuente: string): string {
  return fuente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

test("⚠️ NADIE manda a una portada web sin pasar por `portadaDe`", () => {
  /*
   * Esta es la prueba que habría atrapado el fallo. No comprueba el arreglo:
   * comprueba que no quede otro camino abierto. Un `router.replace("/manager")`
   * suelto en cualquier pantalla futura vuelve a sacar de la app a quien la usa.
   *
   * Se permite `backHref`, que ya pasa por `rutaDeInicio` en `AppHeader`, y las
   * pantallas de escritorio, que no viven dentro de la APK.
   */
  const paginas = globSync("app/**/page.tsx").filter((ruta) =>
    // El escritorio no vive dentro de la APK, y `/mi-dia` es la guarda INVERSA:
    // es la pantalla que decide SALIR hacia la web cuando no estamos en Android.
    !ruta.includes("escritorio") && !ruta.includes("mi-dia")
  );
  const culpables: string[] = [];

  for (const ruta of paginas) {
    const fuente = sinComentarios(readFileSync(ruta, "utf8"));
    // Solo la NAVEGACIÓN: un `backHref` o un `<Link>` no sacan a nadie de la app.
    const navega = /router\.(replace|push)\(\s*[^)]*["'`]\/(manager|advisor)["'`]/;
    if (navega.test(fuente)) culpables.push(ruta.replace(/\\/g, "/"));
  }

  assert.deepEqual(
    culpables,
    [],
    `Estas pantallas navegan a una portada web a mano. Usa \`portadaDe\`:\n  ${culpables.join("\n  ")}`
  );
});
