import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { POST_WINDOW_MS, UPCOMING_WINDOW_MS, serializeMatch } from "@/lib/match";

export const dynamic = "force-dynamic";

// GET — el partido relevante ahora mismo: uno EN VIVO, dentro de su ventana, o
// el próximo programado dentro de 48 h. Devuelve null si no hay nada.
export async function GET() {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });

  const now = Date.now();
  const match = await prisma.matchEvent.findFirst({
    where: {
      status: { not: "FINISHED" },
      // Un partido EN VIVO nunca sale de la ventana: con tiempos extra y
      // penales puede rebasar las 3 h desde el kickoff.
      OR: [
        { status: "LIVE" },
        { kickoff: { gte: new Date(now - POST_WINDOW_MS), lte: new Date(now + UPCOMING_WINDOW_MS) } }
      ]
    },
    orderBy: { kickoff: "asc" }
  });

  return NextResponse.json({
    match: match ? serializeMatch(match) : null,
    canManage: session.role === "GERENTE" || session.role === "SUBGERENTE"
  });
}
