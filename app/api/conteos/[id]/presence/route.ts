import { NextResponse } from "next/server";
import { isApiError, requireSession } from "@/lib/api";
import { claveFisico, latir, presentes, retirar } from "@/lib/conteo-presence";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Presencia en vivo del conteo: quién está capturando qué marbete.
// GET → lista (sin uno mismo). POST { tagNumber } → heartbeat. DELETE → salir.

// Aísla por tienda: el conteo debe pertenecer a la tienda de la sesión antes de
// leer/escribir su presencia (evita fisgonear conteos de otras tiendas).
async function countInStore(id: string, storeId: string) {
  const count = await prisma.cycleCount.findFirst({ where: { id, storeId }, select: { id: true } });
  return count !== null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  if (isApiError(session)) return session;
  if (!(await countInStore(id, session.storeId))) return NextResponse.json({ error: "Conteo no encontrado." }, { status: 404 });
  const present = await presentes(claveFisico(id), session.userId);
  return NextResponse.json({ present }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  if (isApiError(session)) return session;
  if (!(await countInStore(id, session.storeId))) return NextResponse.json({ error: "Conteo no encontrado." }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as { tagNumber?: number };
  const tagNumber = Number(body?.tagNumber);
  if (!Number.isFinite(tagNumber)) return NextResponse.json({ error: "tagNumber inválido." }, { status: 400 });
  await latir(claveFisico(id), session.userId, session.name, tagNumber);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  if (isApiError(session)) return session;
  if (!(await countInStore(id, session.storeId))) return NextResponse.json({ error: "Conteo no encontrado." }, { status: 404 });
  await retirar(claveFisico(id), session.userId);
  return NextResponse.json({ ok: true });
}
