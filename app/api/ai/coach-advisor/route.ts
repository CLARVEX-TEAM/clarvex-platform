import { NextResponse } from "next/server";
import { enforceAiRateLimit, requireSession, isApiError } from "@/lib/api";
import { ClarvexIntelligence } from "@/lib/clarvex-intelligence";
import { prisma } from "@/lib/prisma";
import { canAccessAdvisorProfile } from "@/lib/security";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await requireSession(["ASESOR", "GERENTE", "SUBGERENTE"]);
  if (isApiError(session)) return session;
  const limited = await enforceAiRateLimit(session.userId);
  if (limited) return limited;

  try {
    const body = await request.json().catch(() => ({}));
    const userId = body.userId || session.userId;

    // El integrante solicitado debe existir
    const targetUser = await prisma.user.findFirst({
      where: { id: userId }
    });
    if (!targetUser) {
      return NextResponse.json({ error: "Colaborador no encontrado." }, { status: 404 });
    }

    // Verificar permisos de acceso
    if (!canAccessAdvisorProfile(session, userId, targetUser.storeId)) {
      if (session.role === "ASESOR") {
        return NextResponse.json({ error: "No tienes permiso para ver el perfil de otros colaboradores." }, { status: 403 });
      }
      return NextResponse.json({ error: "Colaborador no encontrado en tu tienda." }, { status: 404 });
    }

    const profile = await ClarvexIntelligence.getAdvisorProfile(session, userId);

    // Map profile details to tips to maintain UI backward compatibility
    const tips = [
      {
        title: "Técnica de Venta Clave",
        description: profile.techniques[0] || "Enfócate en abordar al cliente de inmediato."
      },
      {
        title: "Foco de Producto",
        description: `Impulsa hoy: ${profile.productsToPush}`
      },
      {
        title: "Área de Oportunidad",
        description: `Tu punto a mejorar es: ${profile.weakestKpi.name}. ${profile.weakestKpi.details}`
      }
    ];

    return NextResponse.json({ ...profile, tips });
  } catch (error: any) {
    console.error("[Coach AI API Error]:", error);
    return NextResponse.json(
      { error: error.message || "Error al procesar el perfil del coach de IA." },
      { status: 500 }
    );
  }
}
