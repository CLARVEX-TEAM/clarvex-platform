import { NextResponse } from "next/server";
import { z } from "zod";
import { DATA_SOURCE_ROLES } from "@/lib/access-control";
import { isApiError, requireSession } from "@/lib/api";
import { syncPowerBiKpis } from "@/lib/integrations/power-bi-sync";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  day: z.number().int().min(1).max(31).optional(),
  month: z.number().int().min(1).max(12).optional(),
  year: z.number().int().min(2000).max(2100).optional()
}).refine(
  (value) => {
    const keys = [value.day, value.month, value.year];
    return keys.every((item) => item === undefined) || keys.every((item) => item !== undefined);
  },
  { message: "day, month y year deben enviarse juntos o omitirse." }
);

export async function POST(request: Request) {
  const session = await requireSession(DATA_SOURCE_ROLES);
  if (isApiError(session)) return session;

  let calendar: { day: number; month: number; year: number } | undefined;
  try {
    const text = await request.text();
    if (text.trim()) {
      const json = JSON.parse(text) as unknown;
      const parsed = bodySchema.parse(json);
      if (parsed.day && parsed.month && parsed.year) {
        calendar = { day: parsed.day, month: parsed.month, year: parsed.year };
      }
    }
  } catch {
    return NextResponse.json({ error: "Fecha inválida. Usa day, month y year juntos." }, { status: 400 });
  }

  const result = await syncPowerBiKpis(session.storeId, calendar);
  if (!result.ok) {
    const status = result.error.includes("expiró") ? 401 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({
    ok: true,
    message: result.message,
    bytes: result.bytes,
    metrics: result.metrics
  });
}
