import { NextResponse } from "next/server";
import { isApiError, parseJson, requireSession } from "@/lib/api";
import { fixtureInput, serializeFixture } from "@/lib/fixtures";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const updateSchema = fixtureInput.partial();

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession(["GERENTE", "SUBGERENTE"]);
  if (isApiError(session)) return session;
  const parsed = await parseJson(request, updateSchema);
  if ("response" in parsed) return parsed.response;
  const current = await prisma.storeFixture.findFirst({ where: { id, storeId: session.storeId } });
  if (!current) return NextResponse.json({ error: "Mueble no encontrado." }, { status: 404 });
  const fixture = await prisma.storeFixture.update({ where: { id: current.id }, data: parsed.data });
  return NextResponse.json({ fixture: serializeFixture(fixture) });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession(["GERENTE", "SUBGERENTE"]);
  if (isApiError(session)) return session;
  const current = await prisma.storeFixture.findFirst({ where: { id, storeId: session.storeId } });
  if (!current) return NextResponse.json({ error: "Mueble no encontrado." }, { status: 404 });
  await prisma.storeFixture.delete({ where: { id: current.id } });
  return NextResponse.json({ ok: true });
}
