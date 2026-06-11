import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// In-memory rate limiter: 10 req/min per IP
const rateLimit = new Map<string, { count: number; resetAt: number }>();
let cleanupCounter = 0;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  if (++cleanupCounter % 50 === 0) {
    Array.from(rateLimit.entries()).forEach(([key, entry]) => {
      if (entry.resetAt < now) rateLimit.delete(key);
    });
  }
  const entry = rateLimit.get(ip);
  if (!entry || entry.resetAt < now) {
    rateLimit.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= 10) return false;
  entry.count++;
  return true;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ employeeNumber: string }> }
) {
  const headersList = await headers();
  const ip =
    headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headersList.get("x-real-ip") ??
    "unknown";

  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes. Intenta en un minuto." },
      { status: 429 }
    );
  }

  const { employeeNumber } = await params;
  if (!employeeNumber || !/^\d+$/.test(employeeNumber)) {
    return NextResponse.json({ error: "Número de empleado inválido." }, { status: 400 });
  }

  const user = await prisma.user.findFirst({
    where: {
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
