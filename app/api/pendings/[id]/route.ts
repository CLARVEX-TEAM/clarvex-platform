import { NextResponse } from "next/server";
import { PendingStatus } from "@prisma/client";
import { z } from "zod";
import { isApiError, parseJson, requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { pendingInput, serializePending } from "@/lib/pending";

export const dynamic = "force-dynamic";

const updateSchema = pendingInput.partial().extend({ status: z.nativeEnum(PendingStatus).optional() });

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await requireSession(["GERENTE", "SUBGERENTE"]);
  if (isApiError(session)) return session;
  const parsed = await parseJson(request, updateSchema);
  if ("response" in parsed) return parsed.response;
  const current = await prisma.pending.findFirst({ where: { id: params.id, storeId: session.storeId } });
  if (!current) return NextResponse.json({ error: "Pendiente no encontrado." }, { status: 404 });
  if (parsed.data.ownerId) {
    const owner = await prisma.user.findFirst({ where: { id: parsed.data.ownerId, storeId: session.storeId } });
    if (!owner) return NextResponse.json({ error: "El responsable no pertenece a tu tienda." }, { status: 400 });
  }
  const { dueDate, ...data } = parsed.data;
  const item = await prisma.pending.update({ where: { id: current.id }, data: { ...data, ...(dueDate ? { dueDate: new Date(`${dueDate}T12:00:00.000Z`) } : {}) } });
  return NextResponse.json({ pending: serializePending(item) });
}
