import { NextResponse } from "next/server";
import { isApiError, parseJson, requireSession } from "@/lib/api";
import { fixtureInput, serializeFixture } from "@/lib/fixtures";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireSession();
  if (isApiError(session)) return session;
  const fixtures = await prisma.storeFixture.findMany({ where: { storeId: session.storeId }, orderBy: [{ row: "asc" }, { col: "asc" }] });
  return NextResponse.json({ fixtures: fixtures.map(serializeFixture) }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const session = await requireSession(["GERENTE", "SUBGERENTE"]);
  if (isApiError(session)) return session;
  const parsed = await parseJson(request, fixtureInput);
  if ("response" in parsed) return parsed.response;
  const fixture = await prisma.storeFixture.create({ data: { ...parsed.data, storeId: session.storeId } });
  return NextResponse.json({ fixture: serializeFixture(fixture) }, { status: 201 });
}
