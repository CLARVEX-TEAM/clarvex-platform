type Entry = { count: number; resetAt: number };

const store = new Map<string, Entry>();

const WINDOW_MS = 60_000;

function check(key: string, max: number): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  let entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    entry = { count: 1, resetAt: now + WINDOW_MS };
    store.set(key, entry);
    return { allowed: true, retryAfterSeconds: 0 };
  }

  entry.count++;
  if (entry.count > max) {
    return { allowed: false, retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000) };
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

// 30 inspections per minute per IP (UX flow)
export function rateLimitInspect(ip: string) {
  return check(`inspect:${ip}`, 30);
}

// 10 login/setup attempts per minute per IP
export function rateLimitAuth(ip: string) {
  return check(`auth:${ip}`, 10);
}
