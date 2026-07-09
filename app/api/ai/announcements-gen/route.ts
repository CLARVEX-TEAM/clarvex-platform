import { NextResponse } from "next/server";
import { requireSession, isApiError } from "@/lib/api";
import { ClarvexIntelligence } from "@/lib/clarvex-intelligence";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await requireSession(["GERENTE", "SUBGERENTE"]);
  if (isApiError(session)) return session;

  try {
    const { prompt } = await request.json();
    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json({ error: "Debe ingresar una idea o descripción para el comunicado." }, { status: 400 });
    }

    const announcement = await ClarvexIntelligence.generateAnnouncement(session, prompt);
    return NextResponse.json(announcement);
  } catch (error: any) {
    console.error("[Announcements Gen Route Error]:", error);
    return NextResponse.json(
      { error: error.message || "Error al generar el comunicado con IA." },
      { status: 500 }
    );
  }
}
