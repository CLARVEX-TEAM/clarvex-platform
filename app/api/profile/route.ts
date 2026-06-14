import { NextResponse } from "next/server";
import { z } from "zod";
import { isApiError, parseJson, requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const schema = z.object({
  birthDate: z.string().regex(DATE_RE).nullable().optional(),
  hireDate: z.string().regex(DATE_RE).nullable().optional()
});

function toDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined; // sin cambio
  return value === null ? null : new Date(`${value}T00:00:00.000Z`);
}

function serialize(user: { birthDate: Date | null; hireDate: Date | null }) {
  return {
    birthDate: user.birthDate ? user.birthDate.toISOString().slice(0, 10) : null,
    hireDate: user.hireDate ? user.hireDate.toISOString().slice(0, 10) : null
  };
}

export async function GET() {
  const session = await requireSession();
  if (isApiError(session)) return session;
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { birthDate: true, hireDate: true } });
  return NextResponse.json(serialize(user ?? { birthDate: null, hireDate: null }));
}

export async function PUT(request: Request) {
  const session = await requireSession();
  if (isApiError(session)) return session;
  const parsed = await parseJson(request, schema);
  if ("response" in parsed) return parsed.response;

  const data: { birthDate?: Date | null; hireDate?: Date | null } = {};
  const birth = toDate(parsed.data.birthDate);
  const hire = toDate(parsed.data.hireDate);
  if (birth !== undefined) data.birthDate = birth;
  if (hire !== undefined) data.hireDate = hire;

  const user = await prisma.user.update({ where: { id: session.userId }, data, select: { birthDate: true, hireDate: true } });
  return NextResponse.json(serialize(user));
}
