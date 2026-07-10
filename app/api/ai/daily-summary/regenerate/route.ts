import { NextResponse } from "next/server";
import { requireSession, isApiError } from "@/lib/api";

export const dynamic = "force-dynamic";

/** Regeneración del resumen diario con IA deshabilitada. */
export async function POST() {
  const session = await requireSession(["GERENTE", "SUBGERENTE"]);
  if (isApiError(session)) return session;

  return NextResponse.json(
    { error: "La regeneración del resumen con IA está deshabilitada." },
    { status: 410 }
  );
}
