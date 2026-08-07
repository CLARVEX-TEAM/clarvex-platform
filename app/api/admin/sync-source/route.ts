import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSync } from "@/lib/admin-sync-auth";
import { syncDataSource } from "@/lib/data-source-sync";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Una sincronización puede tardar minutos: el RDV se descarga y se importa fila a fila.
export const maxDuration = 300;

/**
 * Sincroniza UNA fuente de datos, sin sesión de usuario.
 *
 * Existe porque el panel de administración externo necesita arreglar el enlace
 * de cualquier tienda y comprobarlo al momento. Las rutas de
 * `/api/data-sources/[id]/*` no sirven para eso: exigen sesión y solo dejan
 * tocar la tienda de quien entra, que es justo lo que obligaba a pedírselo a
 * cada gerente.
 *
 * Superficie mínima a propósito: recibe un id, sincroniza esa fuente y
 * devuelve el resultado. No crea, no borra y no cambia la configuración.
 */
const bodySchema = z.object({ sourceId: z.string().min(1).max(64) });

export async function POST(request: Request) {
  const unauthorized = requireAdminSync(request);
  if (unauthorized) return unauthorized;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo invalido." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Falta sourceId." }, { status: 400 });
  }

  const source = await prisma.dataSource.findUnique({ where: { id: parsed.data.sourceId } });
  if (!source) return NextResponse.json({ error: "Fuente de datos no encontrada." }, { status: 404 });
  // Una fuente MANUAL no tiene de dónde leer: sincronizarla no haría nada y el
  // error genérico que devolvería no explicaría por qué.
  if (source.provider === "MANUAL") {
    return NextResponse.json(
      { error: "Esta fuente esta en modo MANUAL: no tiene archivo que sincronizar." },
      { status: 409 }
    );
  }

  const outcome = await syncDataSource(source);
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: 502 });

  return NextResponse.json({
    ok: true,
    message: outcome.message,
    // Se devuelven las métricas del tipo que corresponda para que el panel
    // muestre venta, meta, tickets y unidades sin volver a consultar la base.
    kpiMetrics: outcome.kpiMetrics ?? null,
    scheduleMetrics: outcome.scheduleMetrics ?? null,
    discountMetrics: outcome.discountMetrics ?? null,
    attendanceMetrics: outcome.attendanceMetrics ?? null
  });
}
