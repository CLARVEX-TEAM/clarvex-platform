import type { User } from "@/lib/types";

// Perfiles guardados en el dispositivo (estilo Netflix) para el inicio de sesión
// de escritorio. Solo se guarda info no sensible para pintar las tarjetas: el
// PIN NUNCA se guarda — siempre se pide al elegir el perfil.
export type SavedProfile = {
  employeeNumber: string;
  name: string;
  role: User["role"];
  photoUrl?: string | null;
  storeName?: string | null;
};

const PROFILES_KEY = "clarvex.desktop.profiles";
const FRESH_KEY = "clarvex.desktop.fresh";
const MAX_PROFILES = 8;

export function getSavedProfiles(): SavedProfile[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PROFILES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedProfile[];
    return Array.isArray(parsed) ? parsed.filter((p) => p && p.employeeNumber && p.name) : [];
  } catch {
    return [];
  }
}

export function saveProfile(
  user: Pick<User, "employeeNumber" | "name" | "role" | "photoUrl" | "storeName">
) {
  if (typeof window === "undefined" || !user.employeeNumber) return;
  const profile: SavedProfile = {
    employeeNumber: user.employeeNumber,
    name: user.name,
    role: user.role,
    photoUrl: user.photoUrl ?? null,
    storeName: user.storeName ?? null
  };
  const others = getSavedProfiles().filter((p) => p.employeeNumber !== profile.employeeNumber);
  const next = [profile, ...others].slice(0, MAX_PROFILES);
  try {
    window.localStorage.setItem(PROFILES_KEY, JSON.stringify(next));
  } catch {
    /* almacenamiento lleno o bloqueado: ignorar */
  }
}

export function removeProfile(employeeNumber: string) {
  if (typeof window === "undefined") return;
  const next = getSavedProfiles().filter((p) => p.employeeNumber !== employeeNumber);
  try {
    window.localStorage.setItem(PROFILES_KEY, JSON.stringify(next));
  } catch {
    /* ignorar */
  }
}

// Token de un solo uso: se marca justo después de un login explícito en /login
// para que el escritorio no vuelva a pedir PIN de inmediato tras iniciar sesión.
// Cualquier recarga posterior ya no tendrá el token y volverá a bloquear.
export function markDesktopFreshLogin() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(FRESH_KEY, "1");
  } catch {
    /* ignorar */
  }
}

export function consumeDesktopFreshLogin(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const has = window.sessionStorage.getItem(FRESH_KEY) === "1";
    if (has) window.sessionStorage.removeItem(FRESH_KEY);
    return has;
  } catch {
    return false;
  }
}
