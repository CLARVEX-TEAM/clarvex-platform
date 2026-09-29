import { verifyPin } from "@/lib/security";

/*
 * ⚠️ **AQUÍ NO SE IMPORTA `lib/prisma`, y no es estilo.**
 *
 * Ese módulo LANZA al importarse fuera de la configuración de integración, así
 * que cualquier archivo que lo toque queda imposible de cubrir con pruebas
 * unitarias. Es la misma razón por la que `lib/attendance-roll-call-plan.ts`
 * existe aparte, y lo que permite comprobar este candado sin base de datos.
 *
 * El trato: aquí se DECIDE y se dice qué hay que escribir; quien llama lee la
 * fila y aplica la escritura.
 */

/*
 * ⚠️ **La política de bloqueo vive AQUÍ**, no duplicada en cada puerta.
 *
 * Dos copias de un candado se separan en cuanto alguien toca una, y la que
 * quede más floja se convierte en la puerta: quien quiera adivinar un PIN
 * probaría por donde se cuenten menos intentos.
 */
export const MAX_PIN_ATTEMPTS = 5;
export const PIN_LOCK_MS = 15 * 60 * 1000;
/** Cada bloqueo consecutivo dura el doble, con tope de 24 h. */
export const MAX_PIN_LOCK_MS = 24 * 60 * 60 * 1000;

/** Lo que hace falta de la fila de `User` para decidir. */
export type FilaDeUsuario = {
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

/** Lo que quien llama tiene que guardar en esa fila. `null` = nada que guardar. */
export type EscrituraDePin = {
  failedPinAttempts: number;
  pinLockedUntil?: Date | null;
  pinLockoutCount?: number;
} | null;

export type DecisionPin =
  | { ok: true; nombre: string; escribir: EscrituraDePin }
  | { ok: false; motivo: "credenciales"; escribir: EscrituraDePin }
  | { ok: false; motivo: "bloqueada"; segundos: number; escribir: null };

/**
 * ¿Es este el PIN de alguien de GERENCIA de esta tienda?
 *
 * Decide y nada más: no crea sesión, no la cambia y no devuelve datos de la
 * persona más allá de su nombre, que es lo que se audita. Sirve para autorizar
 * una acción puntual desde una sesión que ya existe.
 *
 * ⚠️ **Un «no» siempre se ve igual desde fuera.** Número que no existe, persona
 * dada de baja, asesor, gerencia de OTRA tienda y PIN equivocado devuelven todos
 * `credenciales`. Distinguirlos convertiría esto en una forma de averiguar quién
 * trabaja dónde y con qué puesto, tecleando números de empleado.
 *
 * ⚠️ **Y los fallos se CUENTAN igual que en el login**, con el mismo bloqueo y
 * el mismo backoff. Un PIN es de cuatro dígitos: sin contar intentos, esto sería
 * una puerta de diez mil llaves que se puede probar entera.
 */
export async function decidirPinDeGerencia(
  user: FilaDeUsuario | null,
  pin: string,
  storeId: string
): Promise<DecisionPin> {
  /*
   * ⚠️ El filtro de puesto y de TIENDA va antes de mirar el PIN, pero su «no» es
   * el mismo. Sin el filtro de tienda, el PIN de gerencia de cualquier sucursal
   * abriría el kiosko de todas.
   */
  const esGerencia = user?.role === "GERENTE" || user?.role === "SUBGERENTE" || user?.platformAdmin === true;
  if (!user || !user.active || !user.pinHash || !esGerencia || user.storeId !== storeId) {
    return { ok: false, motivo: "credenciales", escribir: null };
  }

  if (user.pinLockedUntil && user.pinLockedUntil.getTime() > Date.now()) {
    return {
      ok: false,
      motivo: "bloqueada",
      segundos: Math.ceil((user.pinLockedUntil.getTime() - Date.now()) / 1000),
      escribir: null
    };
  }

  if (!(await verifyPin(pin, user.pinHash))) {
    const intentos = user.failedPinAttempts + 1;
    if (intentos < MAX_PIN_ATTEMPTS) {
      return { ok: false, motivo: "credenciales", escribir: { failedPinAttempts: intentos } };
    }
    const bloqueos = user.pinLockoutCount + 1;
    const ms = Math.min(PIN_LOCK_MS * 2 ** (bloqueos - 1), MAX_PIN_LOCK_MS);
    return {
      ok: false,
      motivo: "credenciales",
      escribir: { failedPinAttempts: 0, pinLockedUntil: new Date(Date.now() + ms), pinLockoutCount: bloqueos }
    };
  }

  /*
   * Acierto: se limpia el contador, igual que hace el login. Si no, cuatro
   * fallos de ayer más uno de mañana bloquearían a quien sí sabe su PIN.
   */
  return {
    ok: true,
    nombre: user.name,
    escribir: { failedPinAttempts: 0, pinLockedUntil: null, pinLockoutCount: 0 }
  };
}
