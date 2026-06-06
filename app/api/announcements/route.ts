import { NextResponse } from "next/server";
import { z } from "zod";
import { isApiError, parseJson, requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await requireSession(["GERENTE", "SUBGERENTE"]);
  if (isApiError(session)) return session;
  const parsed = await parseJson(request, z.object({ title: z.string().trim().min(3).max(120), body: z.string().trim().min(3).max(2000) }));
  if ("response" in parsed) return parsed.response;
  const announcement = await prisma.announcement.create({ data: { storeId: session.storeId, authorId: session.userId, ...parsed.data }, include: { reads: true } });
  return NextResponse.json({ announcement: { id: announcement.id, title: announcement.title, body: announcement.body, authorId: announcement.authorId, date: announcement.createdAt.toISOString().slice(0, 10), readBy: [] } }, { status: 201 });
}
