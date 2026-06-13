import { NextResponse } from "next/server";
import { syncDataSource } from "@/lib/data-source-sync";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Sincronización secuencial de múltiples fuentes: puede tardar varios minutos.
export const maxDuration = 300;

// Orden de sincronización: KPIs primero (los Descuentos POS se anclan a registros KPI existentes).
const TYPE_ORDER: Record<string, number> = { KPIS: 0, HORARIOS: 1, DESCUENTOS_POS: 2 };

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  // Todas las fuentes auto-sincronizables (SharePoint/Excel; se excluye MANUAL).
  const sources = await prisma.dataSource.findMany({ where: { provider: { not: "MANUAL" } } });
  const ordered = [...sources].sort((a, b) => (TYPE_ORDER[a.type] ?? 9) - (TYPE_ORDER[b.type] ?? 9));

  let synced = 0;
  let failed = 0;
  const results: Array<{ id: string; type: string; name: string; ok: boolean; message?: string; error?: string }> = [];

  for (const source of ordered) {
    const outcome = await syncDataSource(source);
    if (outcome.ok) {
      synced += 1;
      results.push({ id: source.id, type: source.type, name: source.name, ok: true, message: outcome.message });
    } else {
      failed += 1;
      results.push({ id: source.id, type: source.type, name: source.name, ok: false, error: outcome.error });
    }
  }

  return NextResponse.json({ synced, failed, sources: results });
}
