import bcrypt from "bcryptjs";
import type { Session } from "@/lib/session-token";
import type { Role } from "@/lib/types";

export function hashPin(pin: string) {
  return bcrypt.hash(pin, 12);
}

export function verifyPin(pin: string, pinHash: string) {
  return bcrypt.compare(pin, pinHash);
}

export function canAccessAppData(session: Session | null) {
  return session !== null;
}

export function canModifyPending(session: Session | null, storeId: string) {
  return Boolean(session && session.storeId === storeId && (session.role === "GERENTE" || session.role === "SUBGERENTE"));
}

/**
 * Datos que se pueden entregar ANTES de autenticar (paso "inspect" del login:
 * el usuario tecleó su número pero todavía no prueba que es él).
 *
 * Cualquiera puede teclear números de empleado, así que todo lo que salga de
 * aquí es cosechable por un desconocido. Se limita al mínimo que el login
 * necesita para funcionar:
 *
 * - `name`: el saludo ("Hola ADRIAN"). Decisión de producto consciente.
 * - `biometricEnabled`: para saber si se ofrece el botón de Face ID.
 * - `employeeNumber`: quien pregunta ya lo sabe (lo acaba de teclear).
 *
 * NO se entregan (y no deben volver): foto, rol, último acceso ni el id interno.
 * La foto es el dato más sensible (una cara + un nombre + un centro de trabajo),
 * y el resto la app ni siquiera los usaba antes de autenticar.
 */
export function publicUserPreAuth<T extends { name: string; employeeNumber: string; biometricEnabled: boolean }>(user: T) {
  return {
    name: user.name,
    employeeNumber: user.employeeNumber,
    avatar: user.name.slice(0, 2).toUpperCase(),
    biometricEnabled: user.biometricEnabled
  };
}

export function publicUser<T extends { id: string; name: string; employeeNumber: string; role: Role; photoUrl: string | null; biometricEnabled: boolean; lastLoginAt: Date | null }>(user: T) {
  return {
    id: user.id,
    name: user.name,
    employeeNumber: user.employeeNumber,
    role: user.role,
    avatar: user.name.slice(0, 2).toUpperCase(),
    photoUrl: user.photoUrl,
    biometricEnabled: user.biometricEnabled,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null
  };
}

export function canSetupPin(callerSession: Session | null, targetStoreId: string) {
  if (!callerSession) return false;
  if (callerSession.platformAdmin) return true;
  return callerSession.storeId === targetStoreId && (callerSession.role === "GERENTE" || callerSession.role === "SUBGERENTE");
}

export function canAccessAdvisorProfile(callerSession: Session | null, targetUserId: string, targetStoreId: string) {
  if (!callerSession) return false;
  if (callerSession.platformAdmin) return true;
  if (callerSession.role === "ASESOR") {
    return callerSession.userId === targetUserId;
  }
  return callerSession.storeId === targetStoreId;
}
