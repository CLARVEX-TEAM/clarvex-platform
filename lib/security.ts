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
