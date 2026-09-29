import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { decidirPinDeGerencia, MAX_PIN_ATTEMPTS } from "../lib/pin-gerencia";
import { hashPin } from "../lib/security";

/**
 * El cierre de sesión del celular KIOSKO.
 *
 * ⚠️ Esto protege la operación de la tienda, no un dato: si cualquiera puede
 * cerrar el kiosko y entrar con su cuenta personal, la tienda se queda sin
 * Checklist y sin Conteos hasta que alguien de gerencia vuelva a abrirlo. Y
 * ninguno de los fallos de aquí da error: o deja pasar a quien no debe, o
 * bloquea a quien sí debe.
 */

type Fila = {
  id: string;
  name: string;
  role: string;
  active: boolean;
  pinHash: string | null;
  storeId: string;
  platformAdmin?: boolean;
  failedPinAttempts: number;
  pinLockedUntil: Date | null;
  pinLockoutCount: number;
};

/* Hash real de «1234», calculado UNA vez: bcrypt con coste 12 no es barato. */
let hashCache: string | null = null;
async function hash1234() { hashCache ??= await hashPin("1234"); return hashCache; }

const GERENTE: Fila = {
  id: "u-ger", name: "Itzel Treviño", role: "GERENTE", active: true,
  pinHash: null, storeId: "tienda-1",
  failedPinAttempts: 0, pinLockedUntil: null, pinLockoutCount: 0
};

/*
 * Se sustituye UNA sola frontera --la base-- y se ejecuta la función REAL,
 * incluida la comparación de bcrypt contra un hash de verdad. Sin Prisma y sin
 * `.env`, igual que `tests/slack-ack-transaction.test.ts`.
 *
 * ⚠️ El hash es real y no simulado a propósito: simulando `verifyPin` la prueba
 * pasaría aunque se comparara el PIN en claro, que es justo lo que no puede
 * ocurrir aquí.
 */
async function verificar(entrada: Fila | null, pin: string, storeId = "tienda-1") {
  const fila = entrada ? { ...entrada, pinHash: entrada.pinHash ?? (await hash1234()) } : null;
  const decision = await decidirPinDeGerencia(fila, pin, storeId);
  const { escribir, ...resultado } = decision;
  return { resultado, escrituras: escribir ? [escribir] : [] };
}

test("el PIN correcto de gerencia autoriza", async () => {
  const { resultado } = await verificar(GERENTE, "1234");
  assert.deepEqual(resultado, { ok: true, nombre: "Itzel Treviño" });
});

test("⚠️ un ASESOR no autoriza, aunque su PIN sea correcto", async () => {
  // Es justo lo que esto viene a impedir: que el equipo cierre el kiosko.
  const { resultado } = await verificar({ ...GERENTE, role: "ASESOR" }, "1234");
  assert.deepEqual(resultado, { ok: false, motivo: "credenciales" });
});

test("⚠️ gerencia de OTRA tienda no autoriza", async () => {
  // Sin esta comprobación, el PIN de gerencia de cualquier sucursal abriría el
  // kiosko de todas.
  const { resultado } = await verificar(GERENTE, "1234", "tienda-2");
  assert.deepEqual(resultado, { ok: false, motivo: "credenciales" });
});

test("⚠️ una baja no autoriza", async () => {
  const { resultado } = await verificar({ ...GERENTE, active: false }, "1234");
  assert.deepEqual(resultado, { ok: false, motivo: "credenciales" });
});

test("⚠️ todos los «no» se ven IGUAL desde fuera", async () => {
  // Distinguirlos convertiría esto en una forma de averiguar quién trabaja
  // dónde y con qué puesto, tecleando números de empleado.
  const casos = await Promise.all([
    verificar(null, "1234"),
    verificar({ ...GERENTE, role: "ASESOR" }, "1234"),
    verificar({ ...GERENTE, active: false }, "1234"),
    verificar(GERENTE, "9999"),
    verificar(GERENTE, "1234", "tienda-2")
  ]);
  for (const caso of casos) assert.deepEqual(caso.resultado, { ok: false, motivo: "credenciales" });
});

test("⚠️ un PIN errado CUENTA el intento", async () => {
  // Un PIN son cuatro dígitos: sin contar intentos, esto es una puerta de diez
  // mil llaves que se puede probar entera desde la propia pantalla.
  const { escrituras } = await verificar(GERENTE, "9999");
  assert.deepEqual(escrituras, [{ failedPinAttempts: 1 }]);
});

test("⚠️ al llegar al máximo BLOQUEA, con backoff", async () => {
  const { escrituras } = await verificar(
    { ...GERENTE, failedPinAttempts: MAX_PIN_ATTEMPTS - 1, pinLockoutCount: 2 },
    "9999"
  );
  const dato = escrituras[0] as { pinLockedUntil: Date; pinLockoutCount: number; failedPinAttempts: number };
  assert.equal(dato.failedPinAttempts, 0);
  assert.equal(dato.pinLockoutCount, 3);
  // Tercer bloqueo: 15 min × 2² = 60 min.
  const minutos = Math.round((dato.pinLockedUntil.getTime() - Date.now()) / 60000);
  assert.equal(minutos, 60);
});

test("una cuenta bloqueada no procesa el PIN", async () => {
  const dentroDe5Min = new Date(Date.now() + 5 * 60 * 1000);
  const { resultado, escrituras } = await verificar({ ...GERENTE, pinLockedUntil: dentroDe5Min }, "1234");
  assert.equal(resultado.ok, false);
  assert.equal(resultado.ok === false && resultado.motivo, "bloqueada");
  assert.deepEqual(escrituras, [], "no debe tocar la cuenta mientras está bloqueada");
});

test("⚠️ acertar LIMPIA el contador", async () => {
  // Si no, cuatro fallos de ayer más uno de mañana bloquean a quien sí sabe su PIN.
  const { escrituras } = await verificar({ ...GERENTE, failedPinAttempts: 4, pinLockoutCount: 1 }, "1234");
  assert.deepEqual(escrituras, [{ failedPinAttempts: 0, pinLockedUntil: null, pinLockoutCount: 0 }]);
});

/* ── Lo que el handler tiene que seguir haciendo ─────────────────────────── */

const RUTA = readFileSync(join(__dirname, "..", "app", "api", "auth", "session", "route.ts"), "utf8");

test("⚠️ la guarda mira checklistOnly, NUNCA el rol", () => {
  // El kiosko está dado de alta con rol ASESOR: filtrar por rol lo dejaría
  // fuera, que es el error que ya se coló en doce consultas de este proyecto.
  assert.match(RUTA, /session\?\.checklistOnly/);
  assert.doesNotMatch(RUTA, /role\s*===\s*"KIOSK"/);
});

test("⚠️ la guarda vive en el SERVIDOR, con freno de intentos", () => {
  // Esconder el botón es interfaz: la petición se puede repetir a mano.
  assert.match(RUTA, /decidirPinDeGerencia/);
  assert.match(RUTA, /rateLimitAuth/);
});

test("⚠️ revocar el aparato y la tienda suspendida cierran SIN PIN", () => {
  /*
   * Sin estas dos salidas, la guarda rompe la revocación: gerencia revoca el
   * kiosko y el kiosko se queda dentro. Y las comprueba el servidor, no se le
   * preguntan al cliente.
   */
  assert.match(RUTA, /storeSuspended/);
  assert.match(RUTA, /nativeDevice\.count/);
  assert.match(RUTA, /status:\s*"ACTIVE"/);
});

test("⚠️ el cierre del kiosko queda AUDITADO", () => {
  // Un kiosko cerrado a media jornada deja la tienda sin capturar, y sin esto
  // no habría forma de saber quién lo autorizó.
  assert.match(RUTA, /kiosko\.cerrar-sesion/);
});

test("⚠️ logout() devuelve resultado y quien lo llama puede fallar", () => {
  // Navegar a /login con la sesión intacta hace creer que se cerró.
  const auth = readFileSync(join(__dirname, "..", "lib", "auth.ts"), "utf8");
  assert.match(auth, /Promise<ResultadoSalida>/);
  assert.match(auth, /requierePin/);
});
