import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { rateLimitPreview } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ employeeNumber: string }> }
) {
  const headersList = await headers();
  const ip =
    headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headersList.get("x-real-ip") ??
    "unknown";

  const rateLimit = rateLimitPreview(ip);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes. Intenta en un minuto." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    );
  }

  const { employeeNumber } = await params;
  if (!employeeNumber || !/^\d+$/.test(employeeNumber)) {
    return NextResponse.json({ error: "Número de empleado inválido." }, { status: 400 });
  }

  const user = await prisma.user.findFirst({
    where: {
      active: true,
      OR: [
        { employeeNumber },
        { employeeNumberAliases: { some: { employeeNumber } } },
      ],
    },
    select: {
      name: true,
      role: true,
      photoUrl: true,
      store: { select: { name: true } },
    },
  });

  if (!user) {
    return NextResponse.json({ error: "Empleado no encontrado." }, { status: 404 });
  }

  // Solo nombre, rol, foto y tienda — sin KPIs antes de autenticar
  return NextResponse.json(
    {
      name: user.name,
      role: user.role,
      photo: user.photoUrl ?? null,
      store: user.store.name,
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
