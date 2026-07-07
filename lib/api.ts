import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { getServerSession, type Session } from "@/lib/session";
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
  if (roles && !roles.includes(session.role)) {
    return NextResponse.json({ error: "No tienes permiso para esta accion." }, { status: 403 });
  }
  return session;
}

export async function requirePlatformAdmin(): Promise<Session | NextResponse> {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Sesion requerida." }, { status: 401 });
  if (!session.platformAdmin) {
    return NextResponse.json({ error: "No tienes permiso para esta accion." }, { status: 403 });
  }
  return session;
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
