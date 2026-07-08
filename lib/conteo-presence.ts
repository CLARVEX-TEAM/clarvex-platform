// Presencia en vivo de conteos (quién está contando qué marbete), EN MEMORIA.
// Es efímera y cosmética: si el proceso reinicia, se reconstruye sola en segundos
// con los siguientes heartbeats. No necesita base de datos ni migración.
// (Válido porque la app corre en un solo proceso PM2.)

type Presence = { userName: string; tagNumber: number; at: number };
const TTL_MS = 12_000; // sin heartbeat en 12 s → deja de mostrarse

const byCount = new Map<string, Map<string, Presence>>();

export function heartbeat(countId: string, userId: string, userName: string, tagNumber: number): void {
  let users = byCount.get(countId);
  if (!users) { users = new Map(); byCount.set(countId, users); }
  users.set(userId, { userName, tagNumber, at: Date.now() });
}

export function clearPresence(countId: string, userId: string): void {
  byCount.get(countId)?.delete(userId);
}

export function listPresence(countId: string, excludeUserId?: string): Array<{ userId: string; userName: string; tagNumber: number }> {
  const users = byCount.get(countId);
  if (!users) return [];
  const now = Date.now();
  const out: Array<{ userId: string; userName: string; tagNumber: number }> = [];
  for (const [userId, presence] of Array.from(users.entries())) {
    if (now - presence.at > TTL_MS) { users.delete(userId); continue; }
    if (userId === excludeUserId) continue;
    out.push({ userId, userName: presence.userName, tagNumber: presence.tagNumber });
  }
  return out;
}
