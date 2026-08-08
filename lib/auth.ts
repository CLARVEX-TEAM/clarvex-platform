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

export async function getSession(): Promise<User | null> {
  const response = await fetch("/api/auth/session", { cache: "no-store" });
  if (!response.ok) return null;
  return ((await response.json()) as { user: User }).user;
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

export async function logout() {
  await fetch("/api/auth/session", { method: "DELETE" });
  // El celular kiosko y las cuentas demo son COMPARTIDOS: sin vaciar la caché
  // del panel, quien entre después vería los datos de quien acaba de salir.
  clearAppDataCache();
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
