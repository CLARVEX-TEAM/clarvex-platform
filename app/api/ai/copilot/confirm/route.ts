import { NextResponse } from "next/server";
import { z } from "zod";
import { confirmProposal } from "@/lib/ai/actions";
import { ProposalError } from "@/lib/ai/errors";
import { isApiError, parseJson, requireSession } from "@/lib/api";

export const dynamic = "force-dynamic";

// Fase 3: confirma y EJECUTA una acción propuesta por el Copilot. El cliente
// solo envía el proposalId; el payload proviene del servidor (propuesta
// persistida) y se revalida rol/tienda desde la sesión actual.
const inputSchema = z.object({ proposalId: z.string().min(1) });

export async function POST(request: Request) {
  const session = await requireSession(["GERENTE", "SUBGERENTE"]);
  if (isApiError(session)) return session;

  const parsed = await parseJson(request, inputSchema);
  if ("response" in parsed) return parsed.response;

  try {
    const outcome = await confirmProposal(session, parsed.data.proposalId);
    return NextResponse.json({ ok: true, ...outcome }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof ProposalError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[Copilot Confirm Error]:", error);
    return NextResponse.json({ error: "No se pudo ejecutar la acción confirmada." }, { status: 500 });
  }
}
