import { NextResponse } from "next/server";
import { z } from "zod";
import { isApiError, parseJson, requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { deleteFromR2 } from "@/lib/r2";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({ status: z.enum(["ABIERTO", "RESUELTO"]) });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession(["GERENTE", "SUBGERENTE"]);
  if (isApiError(session)) return session;

  const parsed = await parseJson(request, schema);
  if ("response" in parsed) return parsed.response;
  const { status } = parsed.data;

  const existing = await prisma.inventoryReport.findFirst({ where: { id, storeId: session.storeId }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Reporte no encontrado." }, { status: 404 });

  await prisma.inventoryReport.update({
    where: { id },
    data: status === "RESUELTO"
      ? { status, resolvedById: session.userId, resolvedAt: new Date() }
      : { status, resolvedById: null, resolvedAt: null }
  });

  return NextResponse.json({ id, status });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession(["GERENTE", "SUBGERENTE"]);
  if (isApiError(session)) return session;

  const existing = await prisma.inventoryReport.findFirst({ where: { id, storeId: session.storeId }, select: { id: true, photoUrl: true } });
  if (!existing) return NextResponse.json({ error: "Reporte no encontrado." }, { status: 404 });

  await prisma.inventoryReport.delete({ where: { id } });
  if (existing.photoUrl) await deleteFromR2(existing.photoUrl).catch(() => undefined);

  return NextResponse.json({ id });
}
