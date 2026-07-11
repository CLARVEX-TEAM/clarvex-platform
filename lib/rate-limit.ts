import { prisma } from "@/lib/prisma";

// Rate limiting de ventana fija respaldado en Postgres para que funcione entre
// múltiples instancias/procesos (PM2 cluster). Antes era un Map en memoria que
// cada proceso mantenía por separado, lo que permitía esquivar el límite.
//
// Es defensa en profundidad: si la BD falla, hace "fail-open" (no bloquea el
// login) — un problema transitorio de BD no debe tumbar la autenticación.

const WINDOW_MS = 60_000;

type Result = { allowed: boolean; retryAfterSeconds: number };

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
    // Limpieza oportunista de ventanas vencidas (evita crecimiento del Map/tabla).
    if (Math.random() < 0.02) {
      await prisma.rateLimitCounter.deleteMany({ where: { resetAt: { lt: new Date(now) } } }).catch(() => undefined);
    }
    if (row.count > max) {
      return { allowed: false, retryAfterSeconds: Math.ceil((resetAt.getTime() - now) / 1000) };
    }
    return { allowed: true, retryAfterSeconds: 0 };
  } catch {
    return { allowed: true, retryAfterSeconds: 0 };
  }
}

// 30 inspections per minute per IP (UX flow)
export function rateLimitInspect(ip: string): Promise<Result> {
  return check("inspect", ip, 30);
}

// 10 login/setup attempts per minute per IP
export function rateLimitAuth(ip: string): Promise<Result> {
  return check("auth", ip, 10);
}

// 10 previews per minute per IP (pantalla de login pública)
export function rateLimitPreview(ip: string): Promise<Result> {
  return check("preview", ip, 10);
}
