import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { resumirReparto, type AparatoCrudo } from "../lib/reparto-app";

/*
 * Por qué existen estas pruebas.
 *
 * Esta pantalla se mira el día de un despliegue para decidir a quién hay que
 * ir a buscar. Equivocarse cuesta trabajo de gente: pintar de atrasado a quien
 * ya actualizó manda a molestar a alguien sin motivo, y darlo por al día
 * cuando no lo está deja a esa persona con una app vieja creyendo que no.
 *
 * El caso torcido es el TELÉFONO COMPARTIDO de la tienda: varias personas usan
 * el mismo aparato y cada sesión reescribe el dueño de su token, así que una
 * persona puede tener registrado uno viejo y el suyo propio al día.
 */

const gente = [
  { id: "u1", nombre: "Itzel" },
  { id: "u2", nombre: "Waira" },
  { id: "u3", nombre: "Jazmin" }
].map((p) => ({ id: p.id, name: p.nombre }));

function aparato(userId: string, appBuild: number | null, appVersion: string | null): AparatoCrudo {
  return { userId, appBuild, appVersion, updatedAt: new Date("2026-09-08T00:00:00Z") };
}

test("cuenta quien tiene la app y quien esta al dia", () => {
  const r = resumirReparto({
    gente,
    aparatos: [aparato("u1", 4, "1.3"), aparato("u2", 2, "1.1")],
    versionPublicada: 4,
    nombrePublicado: "1.3"
  });
  assert.equal(r.total, 3);
  assert.equal(r.conApp, 2);
  assert.equal(r.alDia, 1);
  assert.equal(r.gente.find((p) => p.nombre === "Jazmin")?.aparatos, 0);
});

test("de una persona con VARIOS aparatos manda el mas nuevo", () => {
  /*
   * ⚠️ El teléfono de la tienda lo usan todos y cada sesión reescribe el dueño
   * de su token. Quedarse con el último registrado, o con el primero, pintaría
   * de atrasado a quien sí tiene la versión nueva en SU teléfono. La pregunta
   * es si esa persona PUEDE ver la versión nueva.
   */
  const r = resumirReparto({
    gente,
    // El viejo va DESPUES en la lista, para que no baste con quedarse con el primero.
    aparatos: [aparato("u1", 4, "1.3"), aparato("u1", 2, "1.1")],
    versionPublicada: 4,
    nombrePublicado: "1.3"
  });
  const itzel = r.gente.find((p) => p.nombre === "Itzel");
  assert.equal(itzel?.appBuild, 4);
  assert.equal(itzel?.appVersion, "1.3");
  assert.equal(itzel?.aparatos, 2);
  assert.equal(itzel?.alDia, true);
});

test("un aparato SIN version no es version cero", () => {
  // ⚠️ Son los que se registraron antes de que se guardara la version.
  // Tratarlos como cero pintaria de atrasado a todo el mundo el primer dia.
  const r = resumirReparto({
    gente,
    aparatos: [aparato("u1", null, null)],
    versionPublicada: 4,
    nombrePublicado: "1.3"
  });
  const itzel = r.gente.find((p) => p.nombre === "Itzel");
  assert.equal(itzel?.aparatos, 1, "tiene la app");
  assert.equal(itzel?.appBuild, null, "pero no se sabe cual");
  assert.equal(itzel?.alDia, false);
  assert.equal(r.conApp, 1);
  assert.equal(r.alDia, 0);
});

test("una version MAS NUEVA que la publicada cuenta como al dia", () => {
  // Pasa entre que se compila un APK y se publica en el manifiesto. Exigir
  // igualdad exacta marcaria de atrasado a quien va por delante.
  const r = resumirReparto({
    gente,
    aparatos: [aparato("u1", 5, "1.4")],
    versionPublicada: 4,
    nombrePublicado: "1.3"
  });
  assert.equal(r.gente.find((p) => p.nombre === "Itzel")?.alDia, true);
});

test("sin version publicada NADIE figura al dia", () => {
  // ⚠️ Sin manifiesto no hay contra qué comparar. Decir que todos están al día
  // seria afirmar algo que no se sabe, y justo el dia que falte el APK.
  const r = resumirReparto({
    gente,
    aparatos: [aparato("u1", 4, "1.3")],
    versionPublicada: null,
    nombrePublicado: null
  });
  assert.equal(r.alDia, 0);
  assert.equal(r.conApp, 1);
});

test("el escaner pide resolucion y enfoque, y nunca con `exact`", () => {
  /*
   * ⚠️ Sin pedir resolución el navegador da 640x480, y ahí un QR de marbete a
   * medio metro no se decodifica. Es una pérdida de precisión que NO da ningún
   * error: la cámara se abre igual y simplemente no lee.
   *
   * ⚠️ Y con `exact`, un teléfono que no pueda darlo se queda SIN cámara
   * (`OverconstrainedError`), que es peor que leer despacio.
   */
  const fuente = readFileSync(join(__dirname, "..", "components", "conteos", "ScannerOverlay.tsx"), "utf8");
  assert.match(fuente, /width:\s*\{\s*ideal:\s*1920\s*\}/, "el escáner no pide resolución");
  assert.match(fuente, /focusMode:\s*"continuous"/, "el escáner no pide enfoque continuo");
  assert.doesNotMatch(fuente, /facingMode:\s*\{\s*exact:/, "`exact` deja sin cámara al que no pueda darlo");
  assert.doesNotMatch(
    fuente,
    /getUserMedia\(\{ video: \{ facingMode: "environment" \} \}\)/,
    "vuelve a pedir la cámara sin resolución"
  );
});
