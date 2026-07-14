import { NextResponse } from "next/server";
import { requireCron } from "@/lib/cron-auth";
import { syncDataSource } from "@/lib/data-source-sync";
import { prisma } from "@/lib/prisma";
import { dispatchPushToUsers } from "@/lib/push";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Captura la asistencia del día desde la hoja APERTURA.
 *
 * Se ejecuta VARIAS VECES al día (12:00, 18:00 y 22:00 en el VPS) porque:
 *
 * - La hoja se sobrescribe: si no se baja hoy, el dato se pierde para siempre.
 * - A las 12:00 todavía no ha llegado el turno de la tarde. Cada corrida
 *   actualiza el mismo registro (es idempotente), así que la última gana.
 *
 * Si algo falla, AVISA a gerencia por push. Un cron de asistencia que falla en
 * silencio es peor que no tenerlo: darías por buenos unos datos que no existen,
 * y te enterarías el día que reportas faltas a nómina.
 */
export async function POST(request: Request) {
  const unauthorized = requireCron(request);
  if (unauthorized) return unauthorized;

  const sources = await prisma.dataSource.findMany({
    where: { type: "ASISTENCIA", url: { not: null } }
  });

  if (sources.length === 0) {
    return NextResponse.json({ ok: true, sources: 0, message: "Ninguna tienda tiene configurada la fuente de Asistencia." });
  }

  const results: Array<{ storeId: string; ok: boolean; message: string }> = [];
  for (const source of sources) {
    const outcome = await syncDataSource(source);
    // La sincronización puede "funcionar" y aun así no guardar nada (p. ej. si el
    // archivo no es de hoy). Eso también es un fallo desde el punto de vista de
    // nómina, así que se avisa igual.
    const problem = !outcome.ok
      ? outcome.error
      : outcome.attendanceMetrics && outcome.attendanceMetrics.errors.length > 0
        ? outcome.attendanceMetrics.errors[0]
        : null;

    if (problem) {
      const managers = await prisma.user.findMany({
        where: { storeId: source.storeId, role: { in: ["GERENTE", "SUBGERENTE"] }, active: true },
        select: { id: true }
      });
      await dispatchPushToUsers(managers.map((manager) => manager.id), {
        title: "⚠️ Asistencia no capturada",
        body: problem.slice(0, 160),
        tag: "asistencia",
        url: "/datos"
      }).catch(() => undefined);
    }

    results.push({
      storeId: source.storeId,
      ok: outcome.ok && !problem,
      message: outcome.ok ? outcome.message : outcome.error
    });
  }

  return NextResponse.json({ ok: results.every((result) => result.ok), sources: sources.length, results });
}
