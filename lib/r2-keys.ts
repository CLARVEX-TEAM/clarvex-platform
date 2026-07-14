/**
 * Llaves de R2, separadas por tienda.
 *
 * Layout: `stores/<storeId>/<tipo>/<archivo>`
 *
 * Por qué: la app es multi-tienda. Con las llaves planas de antes
 * (`profiles/…`, `evidences/…`) los archivos de todas las tiendas vivían
 * revueltos, lo que:
 *  - impedía dar de baja una tienda borrando su carpeta,
 *  - e impedía validar la tienda al servir un archivo (un gerente de la tienda B
 *    podía leer la foto de un empleado de la tienda A si conocía la llave).
 *
 * LEGADO: los archivos subidos antes de este cambio siguen en las rutas viejas y
 * NO se migran. La BD guarda la URL completa, y tanto el proxy como la firma
 * derivan la llave de ahí, así que conviven sin tocar nada. Los helpers de
 * lectura aceptan ambas formas a propósito.
 */

export type R2Kind = "profiles" | "evidences" | "chat" | "announcements" | "checklist" | "inventory" | "training";

/** Llave nueva, siempre bajo la carpeta de la tienda. */
export function storeKey(storeId: string, kind: R2Kind, filename: string): string {
  return `stores/${storeId}/${kind}/${filename}`;
}

/** Prefijo de una tienda: lo que habría que borrar para darla de baja. */
export function storePrefix(storeId: string): string {
  return `stores/${storeId}/`;
}

/**
 * ¿Puede esta sesión leer esta foto de perfil?
 *
 * Las fotos de perfil las ve todo el equipo, pero SOLO dentro de su tienda.
 */
export function canReadProfileKey(key: string, storeId: string): boolean {
  if (!key || key.includes("..") || key.length > 500) return false;
  // Nueva: la llave lleva la tienda, así que se valida contra la sesión.
  if (key.startsWith(`stores/${storeId}/profiles/`)) return true;
  // Legado: sin tienda en la llave, no hay nada contra qué validar. Se acepta
  // para no romper las fotos existentes (mismo alcance que antes del cambio).
  if (key.startsWith("profiles/")) return true;
  return false;
}

/**
 * Extrae el roomId de la llave de una imagen de chat. Devuelve null si la llave
 * no tiene forma de imagen de chat (quien llama decide el 400).
 *
 * Acepta las dos formas:
 *   nueva:  stores/<storeId>/chat/<roomId>/<archivo>
 *   legado: evidences/chat/<roomId>/<archivo>
 *
 * El permiso REAL lo sigue dando la membresía al room, que se verifica aparte.
 */
export function chatRoomFromKey(key: string): string | null {
  if (!key || key.includes("..") || key.length > 500) return null;
  const parts = key.split("/");
  if (parts[0] === "stores" && parts[2] === "chat" && parts.length >= 5 && parts[3]) {
    return parts[3];
  }
  if (parts[0] === "evidences" && parts[1] === "chat" && parts.length >= 4 && parts[2]) {
    return parts[2];
  }
  return null;
}
