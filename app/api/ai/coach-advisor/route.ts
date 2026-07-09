import { NextResponse } from "next/server";
import { requireSession, isApiError } from "@/lib/api";
import { ClarvexIntelligence } from "@/lib/clarvex-intelligence";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await requireSession(["ASESOR", "GERENTE", "SUBGERENTE"]);
  if (isApiError(session)) return session;

  try {
    const body = await request.json().catch(() => ({}));
    const userId = body.userId || session.userId;

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
