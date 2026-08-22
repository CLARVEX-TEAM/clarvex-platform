import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminCapture } from "@/lib/admin-capture-auth";
import { getWeeklyPerformance, saveWeeklyPerformance } from "@/lib/weekly-performance";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const percentagesSchema = z.record(z.string(), z.record(z.string(), z.number().finite().min(0).max(100)));
const bodySchema = z.object({
  storeId: z.string().min(1).max(64),
  weekStart: z.string().regex(DATE_RE),
  action: z.enum(["draft", "finalize"]),
  actor: z.string().min(1).max(180),
  minimums: z.record(z.string(), z.number().finite().min(0).max(100_000_000)),
  percentages: percentagesSchema.optional(),
  upliftPercent: z.number().finite().min(0).max(100).optional(),
  whatsappBudget: z.number().finite().min(0).max(100_000_000).optional(),
  note: z.string().max(500).optional()
});

export async function GET(request: Request) {
  const unauthorized = requireAdminCapture(request);
  if (unauthorized) return unauthorized;
  const params = new URL(request.url).searchParams;
  const storeId = params.get("storeId") ?? "";
  const weekStart = parseDay(params.get("weekStart"));
  if (!storeId || !weekStart) return NextResponse.json({ error: "Tienda o semana inválida." }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, data: await getWeeklyPerformance(storeId, weekStart) });
  } catch (error) {
    return NextResponse.json({ error: message(error) }, { status: 422 });
  }
}

export async function POST(request: Request) {
  const unauthorized = requireAdminCapture(request);
  if (unauthorized) return unauthorized;
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 }); }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Cuerpo inválido.", detail: parsed.error.issues.map((issue) => issue.message) }, { status: 400 });
  }
  const weekStart = parseDay(parsed.data.weekStart)!;
  try {
    const data = await saveWeeklyPerformance(parsed.data.storeId, weekStart, parsed.data, parsed.data.actor);
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    const detail = message(error);
    return NextResponse.json({ error: detail }, { status: detail.includes("finalizado") ? 409 : 422 });
  }
}

function parseDay(value: string | null) {
  if (!value || !DATE_RE.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}
function message(error: unknown) { return error instanceof Error ? error.message : "No se pudo procesar la semana."; }
