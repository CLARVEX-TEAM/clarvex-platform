import { NextResponse } from "next/server";
import { requireCron } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Compatibilidad para instalaciones que todavía conserven el cron antiguo.
 *
 * Las fuentes de Excel de Axo fueron retiradas el 14 de agosto de 2026. La
 * operación ahora se captura en Retool, así que alertar por esos enlaces
 * deshabilitados solo genera ruido y conduce a una pantalla ya retirada.
 */
export async function POST(request: Request) {
  const unauthorized = requireCron(request);
  if (unauthorized) return unauthorized;
  return NextResponse.json({ ok: true, disabled: true, alerts: 0, reason: "Captura propia activa." });
}
