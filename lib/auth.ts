import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON
} from "@simplewebauthn/server";
import { clearAppDataCache } from "@/lib/app-data";
import type { User } from "@/lib/types";

/**
 * Lo que devuelve el paso "inspect" del login (ANTES de autenticar). A propósito
 * NO es un `User`: sin sesión no se entregan foto, rol, último acceso ni id
 * interno. Ver publicUserPreAuth en lib/security.
 */
export type PreAuthUser = {
  name: string;
  employeeNumber: string;
  avatar: string;
  biometricEnabled: boolean;
};

type EmployeeLookup = {
  user: PreAuthUser;
  requiresPinSetup: boolean;
};

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "No fue posible completar la solicitud.");
  return payload;
}

/**
 * ⚠️ Un fallo de RED no es «no hay sesión».
 *
 * Devolver `null` cuando la petición ni siquiera llegó mandaría al login a
 * alguien que sí tiene sesión, y en un celular con señal intermitente eso pasa
 * a diario. Así que aquí se reintenta, y si se agotan los intentos se LANZA:
 * quien llama tiene que distinguir «el servidor dice que no» de «no pude
 * preguntar».
 *
 * Sin esto, `/advisor` se quedaba en esqueletos para siempre: la promesa se
 * rechazaba, nadie la atrapaba, y su pantalla de error exigía tener usuario —
 * justo lo que nunca llegaba. Pasaba sobre todo al reanudar la PWA desde
 * segundo plano, que es como se abre la app en tienda.
 */
const SESSION_TIMEOUT_MS = 8000;
const SESSION_ATTEMPTS = 3;

export async function getSession(): Promise<User | null> {
  let lastError: unknown;
  for (let attempt = 0; attempt < SESSION_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SESSION_TIMEOUT_MS);
    try {
      const response = await fetch("/api/auth/session", { cache: "no-store", signal: controller.signal });
      // El servidor CONTESTÓ. Su respuesta manda, sin reintentos: un 401 es una
      // sesión inválida de verdad y repetir la petición no la va a validar.
      if (!response.ok) return null;
      return ((await response.json()) as { user: User }).user;
    } catch (error) {
      lastError = error;
      if (attempt < SESSION_ATTEMPTS - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("No se pudo verificar la sesión.");
}

export async function inspectEmployee(employeeNumber: string) {
  return request<EmployeeLookup>("/api/auth/employee-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "inspect", employeeNumber })
  });
}

export async function loginWithPin(employeeNumber: string, pin: string) {
  // `needsEmail`: la cuenta no tiene correo real (la app le puso un relleno al
  // darla de alta). Se pide AQUÍ, con la sesión ya creada, porque en la pantalla
  // de recuperación no se puede: cualquiera pondría el correo de otro y se
  // quedaría con su cuenta.
  return request<{ user: User; needsEmail?: boolean }>("/api/auth/employee-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "login", employeeNumber, pin })
  });
}

export async function createPin(employeeNumber: string, pin: string) {
  return request<{ user: User }>("/api/auth/employee-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "setup", employeeNumber, pin })
  });
}

/** Lo que hace falta para cerrar el celular kiosko: el PIN de alguien de gerencia. */
export type AutorizacionDeSalida = { employeeNumber: string; pin: string };

export type ResultadoSalida =
  | { ok: true }
  /** El servidor pide autorización, o la que se dio no vale. */
  | { ok: false; requierePin: boolean; error: string };

/**
 * ⚠️ **Ahora puede FALLAR, y por eso devuelve un resultado.**
 *
 * En el celular kiosko el servidor exige el PIN de gerencia: es el aparato
 * compartido de la tienda y su sesión es la única puerta a Checklist y Conteos.
 * Quien no mire lo que devuelve se irá a `/login` con la sesión intacta, y la
 * persona verá la pantalla de acceso, entrará con lo que sea y creerá que
 * funcionó.
 *
 * Fuera del kiosko no cambia nada: sin autorización, el servidor cierra como
 * siempre.
 */
export async function logout(autorizacion?: AutorizacionDeSalida): Promise<ResultadoSalida> {
  const res = await fetch("/api/auth/session", {
    method: "DELETE",
    ...(autorizacion ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(autorizacion) } : {})
  });
  if (!res.ok) {
    const datos = (await res.json().catch(() => ({}))) as { error?: string; requierePin?: boolean };
    return { ok: false, requierePin: datos.requierePin === true, error: datos.error ?? "No se pudo cerrar la sesión." };
  }
  // El celular kiosko y las cuentas demo son COMPARTIDOS: sin vaciar la caché
  // del panel, quien entre después vería los datos de quien acaba de salir.
  clearAppDataCache();
  return { ok: true };
}

export async function getBiometricRegistrationOptions(): Promise<PublicKeyCredentialCreationOptionsJSON> {
  return request<PublicKeyCredentialCreationOptionsJSON>("/api/auth/biometric/register-options");
}

export async function registerBiometric(response: RegistrationResponseJSON) {
  return request<{ verified: boolean }>("/api/auth/biometric/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(response)
  });
}

export async function getBiometricAuthOptions(employeeNumber: string): Promise<PublicKeyCredentialRequestOptionsJSON> {
  return request<PublicKeyCredentialRequestOptionsJSON>("/api/auth/biometric/authenticate-options", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ employeeNumber })
  });
}

export async function authenticateBiometric(employeeNumber: string, response: AuthenticationResponseJSON) {
  return request<{ user: User }>("/api/auth/biometric/authenticate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ employeeNumber, response })
  });
}
