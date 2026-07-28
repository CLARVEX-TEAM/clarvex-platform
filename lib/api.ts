import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { getServerSession, type Session } from "@/lib/session";
import { rateLimitAi, rateLimitUpload } from "@/lib/rate-limit";
import type { Role } from "@/lib/types";

export async function requireSession(
  roles?: Role[],
  options?: { allowSuspended?: boolean }
): Promise<Session | NextResponse> {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Sesion requerida." }, { status: 401 });
  // Los endpoints de pago (allowSuspended) deben funcionar aun con la tienda
  // suspendida: es justo donde el gerente paga para reactivarla.
  if (session.storeSuspended && !session.platformAdmin && !options?.allowSuspended) {
    return NextResponse.json({ error: "La suscripción de esta tienda venció." }, { status: 402 });
  }
  if (roles && !roles.includes(session.role) && !session.platformAdmin) {
    return NextResponse.json({ error: "No tienes permiso para esta accion." }, { status: 403 });
  }
  return session;
}

/**
 * Corta una sesión de demostración. El middleware ya bloquea todo método que no
 * sea GET, pero ese candado no alcanza para tres casos que sí hay que cerrar aquí:
 *
 *  - GET que escriben (presencia del chat, recibos de entrega, challenges WebAuthn).
 *  - GET que cuestan dinero (IA): un visitante anónimo no debe quemar tokens del LLM.
 *  - Todo `/api/auth/*`, que el middleware exceptúa para poder cerrar sesión.
 *
 * Devuelve la respuesta 403 si la sesión es demo, o null si puede continuar.
 */
export function denyDemo(session: Session): NextResponse | null {
  if (!session.demo) return null;
  return NextResponse.json({ error: "Modo demostración: solo lectura." }, { status: 403 });
}

export async function requirePlatformAdmin(): Promise<Session | NextResponse> {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Sesion requerida." }, { status: 401 });
  if (!session.platformAdmin) {
    return NextResponse.json({ error: "No tienes permiso para esta accion." }, { status: 403 });
  }
  return session;
}

/** Rate limit de IA tras autenticar. Devuelve NextResponse 429 o null. */
export async function enforceAiRateLimit(userId: string): Promise<NextResponse | null> {
  const result = await rateLimitAi(userId);
  if (result.allowed) return null;
  return NextResponse.json(
    { error: "Demasiadas solicitudes de IA. Intenta en un momento." },
    { status: 429, headers: { "Retry-After": String(result.retryAfterSeconds) } }
  );
}

/** Rate limit de uploads tras autenticar. Devuelve NextResponse 429 o null. */
export async function enforceUploadRateLimit(userId: string): Promise<NextResponse | null> {
  const result = await rateLimitUpload(userId);
  if (result.allowed) return null;
  return NextResponse.json(
    { error: "Demasiadas subidas. Intenta en un momento." },
    { status: 429, headers: { "Retry-After": String(result.retryAfterSeconds) } }
  );
}

export async function parseJson<T>(request: Request, schema: ZodType<T>) {
  try {
    return { data: schema.parse(await request.json()) } as const;
  } catch (error) {
    const message = error instanceof ZodError
      ? error.issues[0]?.message ?? "Datos invalidos."
      : "El cuerpo de la solicitud no es JSON valido.";
    return { response: NextResponse.json({ error: message }, { status: 400 }) } as const;
  }
}

export function isApiError(value: Session | NextResponse): value is NextResponse {
  return value instanceof NextResponse;
}
