import { NextResponse } from "next/server";
import { isApiError, parseJson, requireSession } from "@/lib/api";
import { pendingInput, serializePending } from "@/lib/pending";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await requireSession(["GERENTE", "SUBGERENTE"]);
  if (isApiError(session)) return session;
  const parsed = await parseJson(request, pendingInput);
  if ("response" in parsed) return parsed.response;
  const owner = await prisma.user.findFirst({ where: { id: parsed.data.ownerId, storeId: session.storeId } });
  if (!owner) return NextResponse.json({ error: "El responsable no pertenece a tu tienda." }, { status: 400 });
  const item = await prisma.pending.create({ data: { ...parsed.data, dueDate: new Date(`${parsed.data.dueDate}T12:00:00.000Z`), storeId: session.storeId } });
  return NextResponse.json({ pending: serializePending(item) }, { status: 201 });
}
