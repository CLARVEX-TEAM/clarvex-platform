import { NextResponse } from "next/server";
import { z } from "zod";
import { isApiError, parseJson, requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireSession(["GERENTE", "SUBGERENTE"]);
  if (isApiError(session)) return session;
  const entries = await prisma.storeLog.findMany({ where: { storeId: session.storeId }, orderBy: { createdAt: "asc" } });
  return NextResponse.json({ logEntries: entries.map((entry) => ({ id: entry.id, date: entry.createdAt.toISOString(), authorId: entry.authorId, category: entry.category, description: entry.description, evidenceUrl: entry.evidenceUrl })) });
}

export async function POST(request: Request) {
  const session = await requireSession(["GERENTE", "SUBGERENTE"]);
  if (isApiError(session)) return session;
  const parsed = await parseJson(request, z.object({ category: z.string().trim().min(3).max(80), description: z.string().trim().min(3).max(2000) }));
  if ("response" in parsed) return parsed.response;
  const entry = await prisma.storeLog.create({ data: { storeId: session.storeId, authorId: session.userId, ...parsed.data } });
  return NextResponse.json({ logEntry: { id: entry.id, date: entry.createdAt.toISOString(), authorId: entry.authorId, category: entry.category, description: entry.description, evidenceUrl: entry.evidenceUrl } }, { status: 201 });
}
