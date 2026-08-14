import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminCapture } from "@/lib/admin-capture-auth";
import {
  loadElectronicTicketCapture,
  saveElectronicTicketCapture
} from "@/lib/electronic-ticket-capture-service";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const storeIdSchema = z.string().trim().min(1).max(64);
const saveSchema = z.object({
  storeId: storeIdSchema,
  weekNumber: z.number().int().min(1).max(53),
  entries: z
    .array(
      z.object({
        userId: z.string().min(1).max(64),
        crmTransactions: z.number().int().min(0).max(100000).nullable(),
        posTransactions: z.number().int().min(0).max(100000).nullable()
      })
    )
    .max(100)
});

async function storeExists(storeId: string) {
  return Boolean(await prisma.store.findUnique({ where: { id: storeId }, select: { id: true } }));
}

export async function GET(request: Request) {
  const unauthorized = requireAdminCapture(request);
  if (unauthorized) return unauthorized;

  const parsed = storeIdSchema.safeParse(new URL(request.url).searchParams.get("storeId"));
  if (!parsed.success) return NextResponse.json({ error: "Tienda inválida." }, { status: 400 });
  if (!(await storeExists(parsed.data))) {
    return NextResponse.json({ error: "Tienda no encontrada." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, ...(await loadElectronicTicketCapture(parsed.data)) });
}

export async function POST(request: Request) {
  const unauthorized = requireAdminCapture(request);
  if (unauthorized) return unauthorized;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }
  const parsed = saveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Cuerpo inválido.", detail: parsed.error.issues.map((issue) => issue.message) },
      { status: 400 }
    );
  }
  if (!(await storeExists(parsed.data.storeId))) {
    return NextResponse.json({ error: "Tienda no encontrada." }, { status: 404 });
  }

  const result = await saveElectronicTicketCapture(
    parsed.data.storeId,
    parsed.data.weekNumber,
    parsed.data.entries
  );
  if (result.rejected.length > 0) {
    return NextResponse.json(
      {
        error: "Hay filas inválidas.",
        detail: result.rejected.map((entry) => `${entry.name} ${entry.reason}`),
        saved: result.saved
      },
      { status: 422 }
    );
  }

  return NextResponse.json({ ok: true, saved: result.saved });
}
