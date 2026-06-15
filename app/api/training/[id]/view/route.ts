import { NextResponse } from "next/server";
import { isApiError, requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  if (isApiError(session)) return session;

  const resource = await prisma.trainingResource.findFirst({ where: { id, storeId: session.storeId }, select: { id: true } });
  if (!resource) return NextResponse.json({ error: "Recurso no encontrado." }, { status: 404 });

  await prisma.trainingResourceView.upsert({
    where: { resourceId_userId: { resourceId: id, userId: session.userId } },
    create: { resourceId: id, userId: session.userId },
    update: {}
  });

  return NextResponse.json({ id, viewed: true });
}
