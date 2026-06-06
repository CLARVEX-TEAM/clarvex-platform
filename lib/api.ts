import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { getServerSession, type Session } from "@/lib/session";
import type { Role } from "@/lib/types";

export async function requireSession(roles?: Role[]): Promise<Session | NextResponse> {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Sesion requerida." }, { status: 401 });
  if (roles && !roles.includes(session.role)) {
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
