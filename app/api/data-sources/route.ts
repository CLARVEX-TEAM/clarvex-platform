import { NextResponse } from "next/server";
import { isApiError, parseJson, requireSession } from "@/lib/api";
import { dataSourceInput, getNextSyncAt, serializeDataSource } from "@/lib/data-source";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const sourceInclude = {
  syncLogs: { orderBy: { createdAt: "desc" as const }, take: 1 }
};

export async function GET() {
  const session = await requireSession(["GERENTE", "SUBGERENTE"]);
  if (isApiError(session)) return session;

  const sources = await prisma.dataSource.findMany({
    where: { storeId: session.storeId },
    include: sourceInclude,
    orderBy: { type: "asc" }
  });

  return NextResponse.json({ dataSources: sources.map(serializeDataSource) });
}

export async function POST(request: Request) {
  const session = await requireSession(["GERENTE", "SUBGERENTE"]);
  if (isApiError(session)) return session;
  const parsed = await parseJson(request, dataSourceInput);
  if ("response" in parsed) return parsed.response;

  const nextSyncAt = getNextSyncAt(parsed.data.frequency);
  const url = parsed.data.url || null;
  const existing = await prisma.dataSource.findUnique({
    where: { storeId_type: { storeId: session.storeId, type: parsed.data.type } }
  });
  const fileChanged = Boolean(existing) && (
    existing?.url !== url || existing?.provider !== parsed.data.provider
  );
  const status = existing && !fileChanged ? existing.status : "DISCONNECTED";
  const source = await prisma.dataSource.upsert({
    where: { storeId_type: { storeId: session.storeId, type: parsed.data.type } },
    update: {
      provider: parsed.data.provider,
      name: parsed.data.name,
      url,
      status,
      frequency: parsed.data.frequency,
      nextSyncAt,
      ...(fileChanged ? { lastSyncAt: null } : {})
    },
    create: {
      storeId: session.storeId,
      type: parsed.data.type,
      provider: parsed.data.provider,
      name: parsed.data.name,
      url,
      status,
      frequency: parsed.data.frequency,
      nextSyncAt
    },
    include: sourceInclude
  });

  return NextResponse.json({ dataSource: serializeDataSource(source) }, { status: 201 });
}
