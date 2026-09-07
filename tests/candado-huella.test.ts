import assert from "node:assert/strict";
import test from "node:test";
import { GRACIA_MS, candadoActivado, guardarCandado, hayQueVolverAPedir } from "../lib/candado-huella";

/*
 * Por qué existen estas pruebas.
 *
 * El candado tapa la app entera. Los dos fallos posibles apuntan en direcciones
 * opuestas y los dos son malos:
 *
 *   - Abrirse cuando no debe: la app queda a la vista en el telefono del
 *     mostrador, que es justo lo que vino a evitar.
 *   - Cerrarse cuando no debe: encierra a alguien fuera de su trabajo en medio
 *     del turno, y no hay forma de arreglarlo desde dentro.
 *
 * ⚠️ Lo mas delicado es la GRACIA. Tomar una foto de evidencia o de un marbete
 * SALE de la app --se abre la camara del sistema-- asi que sin margen pediria la
 * huella cada vez. La gente acabaria apagando el candado, y uno apagado protege
 * menos que uno con un minuto de holgura.
 */

const almacen = new Map<string, string>();
const original = (globalThis as { localStorage?: unknown }).localStorage;

test.beforeEach(() => {
  almacen.clear();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => almacen.get(k) ?? null,
    setItem: (k: string, v: string) => void almacen.set(k, v),
    removeItem: (k: string) => void almacen.delete(k)
  };
});

test.after(() => {
  if (original === undefined) delete (globalThis as { localStorage?: unknown }).localStorage;
  else (globalThis as { localStorage?: unknown }).localStorage = original;
});

test("por defecto el candado esta APAGADO", () => {
  // ⚠️ Encenderlo por omision lo activaria en el telefono compartido de la
  // tienda, donde cualquier huella registrada abre la sesion de quien este
  // dentro. Esa decision no la puede tomar el programa.
  assert.equal(candadoActivado(), false);
});

test("se recuerda al encenderlo y al apagarlo", () => {
  guardarCandado(true);
  assert.equal(candadoActivado(), true);
  guardarCandado(false);
  assert.equal(candadoActivado(), false);
});

test("un localStorage que lanza deja el candado APAGADO, no encendido", () => {
  // ⚠️ Ante un almacenamiento roto se falla hacia el lado que no encierra a
  // nadie: un candado que no se puede leer no puede pedirse, y quedaria
  // cerrado para siempre sin forma de abrirlo.
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: () => {
      throw new Error("bloqueado");
    },
    setItem: () => {
      throw new Error("bloqueado");
    },
    removeItem: () => undefined
  };
  assert.equal(candadoActivado(), false);
  assert.doesNotThrow(() => guardarCandado(true));
});

test("sin haber salido de la app, no se vuelve a pedir", () => {
  assert.equal(hayQueVolverAPedir(null), false);
});

test("una salida corta NO vuelve a pedir la huella", () => {
  // Esto es tomar una foto: se abre la camara y se vuelve en segundos.
  const ahora = 1_000_000;
  assert.equal(hayQueVolverAPedir(ahora - 5_000, ahora), false);
  assert.equal(hayQueVolverAPedir(ahora - (GRACIA_MS - 1), ahora), false);
});

test("una salida larga SI vuelve a pedirla", () => {
  const ahora = 1_000_000;
  assert.equal(hayQueVolverAPedir(ahora - (GRACIA_MS + 1), ahora), true);
  assert.equal(hayQueVolverAPedir(ahora - 3_600_000, ahora), true);
});

test("la gracia es de un minuto, ni cero ni eterna", () => {
  // Cero haria inservible el flujo de fotos; muy larga dejaria el telefono
  // abierto en el mostrador toda la comida.
  assert.ok(GRACIA_MS >= 30_000 && GRACIA_MS <= 300_000, `gracia fuera de rango: ${GRACIA_MS}`);
});
