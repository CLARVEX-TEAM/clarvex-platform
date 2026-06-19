import { NextResponse } from "next/server";
import { requireSession, isApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { serializeMatch } from "@/lib/match";

export const dynamic = "force-dynamic";

// PATCH — editar o cambiar estado (iniciar / finalizar) un partido.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession(["GERENTE", "SUBGERENTE"]);
  if (isApiError(session)) return session;

  const body = (await request.json().catch(() => ({}))) as {
    status?: string;
    opponent?: string;
    opponentFlag?: string;
    competition?: string;
    kickoff?: string;
    mxScore?: number;
    rivalScore?: number;
  };

  const data: Record<string, unknown> = {};
  if (body.status && ["SCHEDULED", "LIVE", "FINISHED"].includes(body.status)) data.status = body.status;
  if (typeof body.opponent === "string" && body.opponent.trim()) data.opponent = body.opponent.trim().slice(0, 60);
  if (typeof body.opponentFlag === "string") data.opponentFlag = body.opponentFlag.trim().slice(0, 8) || null;
  if (typeof body.competition === "string") data.competition = body.competition.trim().slice(0, 40) || null;
  if (body.kickoff) {
    const k = new Date(body.kickoff);
    if (!isNaN(k.getTime())) data.kickoff = k;
  }
  if (typeof body.mxScore === "number" && body.mxScore >= 0) data.mxScore = Math.floor(body.mxScore);
  if (typeof body.rivalScore === "number" && body.rivalScore >= 0) data.rivalScore = Math.floor(body.rivalScore);

  if (Object.keys(data).length === 0) return NextResponse.json({ error: "Nada que actualizar." }, { status: 400 });

  const match = await prisma.matchEvent.update({ where: { id }, data });
  return NextResponse.json({ match: serializeMatch(match) });
}

// DELETE — eliminar un partido.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession(["GERENTE", "SUBGERENTE"]);
  if (isApiError(session)) return session;

  await prisma.matchEvent.delete({ where: { id } }).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
