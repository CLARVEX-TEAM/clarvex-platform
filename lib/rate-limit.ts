import { prisma } from "@/lib/prisma";

// Rate limiting de ventana fija respaldado en Postgres para que funcione entre
// múltiples instancias/procesos (PM2 cluster). Si la BD falla, cae a un Map en
// memoria de esta instancia (fail-closed para auth / abuso; no abre la puerta).

const WINDOW_MS = 60_000;

type Result = { allowed: boolean; retryAfterSeconds: number };

type MemoryEntry = { count: number; resetAt: number };
const memoryBuckets = new Map<string, MemoryEntry>();

function checkMemory(key: string, max: number, windowMs: number, now: number): Result {
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const memKey = `${key}`;
  const resetAt = windowStart + windowMs;
  let entry = memoryBuckets.get(memKey);
  if (!entry || entry.resetAt !== resetAt) {
    entry = { count: 0, resetAt };
    memoryBuckets.set(memKey, entry);
  }
  entry.count += 1;
  // Limpieza oportunista.
  if (Math.random() < 0.02) {
    for (const [k, v] of memoryBuckets) {
      if (v.resetAt < now) memoryBuckets.delete(k);
    }
  }
  if (entry.count > max) {
    return { allowed: false, retryAfterSeconds: Math.ceil((resetAt - now) / 1000) };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

async function check(bucket: string, ip: string, max: number, windowMs = WINDOW_MS): Promise<Result> {
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const key = `${bucket}:${ip}:${windowStart}`;
  const resetAt = new Date(windowStart + windowMs);
  try {
    const row = await prisma.rateLimitCounter.upsert({
      where: { key },
      create: { key, count: 1, resetAt },
      update: { count: { increment: 1 } },
      select: { count: true }
    });
    if (Math.random() < 0.02) {
      await prisma.rateLimitCounter.deleteMany({ where: { resetAt: { lt: new Date(now) } } }).catch(() => undefined);
    }
    if (row.count > max) {
      return { allowed: false, retryAfterSeconds: Math.ceil((resetAt.getTime() - now) / 1000) };
    }
    return { allowed: true, retryAfterSeconds: 0 };
  } catch {
    // Fail-closed vía memoria local: un outage de BD no debe abrir brute-force.
    return checkMemory(key, max, windowMs, now);
  }
}

/** Rate limit por usuario autenticado (no por IP). */
export function rateLimitUser(bucket: string, userId: string, max: number, windowMs = WINDOW_MS): Promise<Result> {
  return check(bucket, `user:${userId}`, max, windowMs);
}

// 30 inspections per minute per IP (UX flow)
export function rateLimitInspect(ip: string): Promise<Result> {
  return check("inspect", ip, 30);
}

// 10 login/setup attempts per minute per IP
export function rateLimitAuth(ip: string): Promise<Result> {
  return check("auth", ip, 10);
}

// Copilot / AI: 20 req/min por usuario
export function rateLimitAi(userId: string): Promise<Result> {
  return rateLimitUser("ai", userId, 20);
}

// Uploads (foto, evidencias, chat image, anuncios): 30/min por usuario
export function rateLimitUpload(userId: string): Promise<Result> {
  return rateLimitUser("upload", userId, 30);
}

// Búsqueda de GIFs: 40/min por usuario
export function rateLimitGifs(userId: string): Promise<Result> {
  return rateLimitUser("gifs", userId, 40);
}
