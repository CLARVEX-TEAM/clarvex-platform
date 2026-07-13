import { NextResponse } from "next/server";
import { z } from "zod";
import { proposeCreateAnnouncement } from "@/lib/ai/actions";
import { buildCopilotContext } from "@/lib/ai/context";
import { enforceAiRateLimit, isApiError, parseJson, requireSession } from "@/lib/api";

export const dynamic = "force-dynamic";

// Permite proponer un comunicado desde la UI cuando el modelo solo entregó
// un borrador (sin llamar proposeCreateAnnouncement). Misma persistencia y
// confirmación en dos pasos que la tool del Copilot.
const inputSchema = z.object({
  title: z.string().trim().min(3).max(120),
  body: z.string().trim().min(3).max(2000)
});

export async function POST(request: Request) {
  const session = await requireSession(["GERENTE", "SUBGERENTE"]);
  if (isApiError(session)) return session;
  const limited = await enforceAiRateLimit(session.userId);
  if (limited) return limited;

  const parsed = await parseJson(request, inputSchema);
  if ("response" in parsed) return parsed.response;

  try {
    const proposal = await proposeCreateAnnouncement(buildCopilotContext(session), parsed.data);
    return NextResponse.json(
      {
        ok: true,
        pendingAction: {
          proposalId: proposal.proposalId,
          type: proposal.type,
          summary: proposal.summary
        }
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    console.error("[Copilot Propose Announcement Error]:", error);
    return NextResponse.json({ error: "No se pudo preparar la publicación del comunicado." }, { status: 500 });
  }
}
