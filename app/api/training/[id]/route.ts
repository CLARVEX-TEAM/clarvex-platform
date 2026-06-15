import { NextResponse } from "next/server";
import { isApiError, requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { deleteFromR2 } from "@/lib/r2";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession(["GERENTE", "SUBGERENTE"]);
  if (isApiError(session)) return session;

  const existing = await prisma.trainingResource.findFirst({ where: { id, storeId: session.storeId }, select: { id: true, fileUrl: true } });
  if (!existing) return NextResponse.json({ error: "Recurso no encontrado." }, { status: 404 });

  await prisma.trainingResource.delete({ where: { id } });
  if (existing.fileUrl) await deleteFromR2(existing.fileUrl).catch(() => undefined);

  return NextResponse.json({ id });
}
