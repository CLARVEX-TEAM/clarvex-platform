import { photoSrc } from "@/lib/photo-src";
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
const AVATAR_PX = 96;

/**
 * Descarga la foto y la guarda como data URL miniatura (96px).
 *
 * El lock de escritorio pinta las tarjetas SIN sesión, así que no puede leer del
 * proxy autenticado ni de una URL firmada (que expiraría). Congelar una
 * miniatura en el dispositivo resuelve las tres cosas: funciona sin sesión, no
 * caduca, y no depende de que el bucket sea público.
 *
 * Se reduce a 96px para no reventar la cuota de localStorage (~5 MB): una foto
 * de 5 MB queda en unos pocos KB.
 */
export async function captureAvatarDataUrl(src: string | null | undefined): Promise<string | null> {
  if (!src || typeof window === "undefined") return null;
  if (src.startsWith("data:")) return src;
  try {
    const response = await fetch(src, { credentials: "same-origin" });
    if (!response.ok) return null;
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = AVATAR_PX;
    canvas.height = AVATAR_PX;
    const context = canvas.getContext("2d");
    if (!context) return null;
    // Recorte cuadrado centrado, igual que el object-cover del avatar.
    const side = Math.min(bitmap.width, bitmap.height);
    const sx = (bitmap.width - side) / 2;
    const sy = (bitmap.height - side) / 2;
    context.drawImage(bitmap, sx, sy, side, side, 0, 0, AVATAR_PX, AVATAR_PX);
    bitmap.close();
    return canvas.toDataURL("image/jpeg", 0.8);
  } catch {
    return null; // sin foto cacheada: la tarjeta cae a las iniciales
  }
}

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
  user: Pick<User, "employeeNumber" | "name" | "role" | "photoUrl" | "storeName">,
  avatarDataUrl?: string | null
) {
  if (typeof window === "undefined" || !user.employeeNumber) return;
  const profile: SavedProfile = {
    employeeNumber: user.employeeNumber,
    name: user.name,
    role: user.role,
    photoUrl: avatarDataUrl ?? user.photoUrl ?? null,
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

/**
 * Guarda el perfil congelando además una miniatura de la foto. Se llama justo
 * después de iniciar sesión, que es el único momento en que se puede leer la
 * foto del proxy autenticado.
 */
export async function saveProfileWithAvatar(
  user: Pick<User, "employeeNumber" | "name" | "role" | "photoUrl" | "storeName">
) {
  const avatar = await captureAvatarDataUrl(photoSrc(user.photoUrl));
  saveProfile(user, avatar);
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
