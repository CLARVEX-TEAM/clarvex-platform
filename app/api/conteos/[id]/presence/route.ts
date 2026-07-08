import { NextResponse } from "next/server";
import { isApiError, requireSession } from "@/lib/api";
import { clearPresence, heartbeat, listPresence } from "@/lib/conteo-presence";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Presencia en vivo del conteo: quién está capturando qué marbete.
// GET → lista (sin uno mismo). POST { tagNumber } → heartbeat. DELETE → salir.

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  if (isApiError(session)) return session;
  return NextResponse.json({ present: listPresence(id, session.userId) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  if (isApiError(session)) return session;
  const body = (await request.json().catch(() => ({}))) as { tagNumber?: number };
  const tagNumber = Number(body?.tagNumber);
  if (!Number.isFinite(tagNumber)) return NextResponse.json({ error: "tagNumber inválido." }, { status: 400 });
  heartbeat(id, session.userId, session.name, tagNumber);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  if (isApiError(session)) return session;
  clearPresence(id, session.userId);
  return NextResponse.json({ ok: true });
}
