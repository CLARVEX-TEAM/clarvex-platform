import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminCapture } from "@/lib/admin-capture-auth";
import { captureKpis } from "@/lib/kpi-capture";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Recalcular ranking y acumulados recorre varias filas por cada día tocado.
export const maxDuration = 120;

/**
 * Captura manual de KPIs desde el panel externo (Retool), sin sesión.
 *
 * Solo acepta los datos CRUDOS: meta, venta, tickets y piezas. `upt`,
 * `avgTicket`, `ranking` y los acumulados del mes los deriva el servidor — ver
 * `lib/kpi-capture`. No se aceptan derivados desde el cliente a propósito: si
 * llegaran, podrían contradecir a sus propios sumandos sin que nadie lo note.
 */
const bodySchema = z.object({
  storeId: z.string().min(1).max(64),
  entries: z
    .array(
      z.object({
        employeeNumber: z.string().min(1).max(32),
        date: z.string().min(10).max(10),
        dailyGoal: z.union([z.number(), z.string()]).nullish(),
        dailySales: z.union([z.number(), z.string()]).nullish(),
        transactions: z.union([z.number(), z.string()]).nullish(),
        pieces: z.union([z.number(), z.string()]).nullish()
      })
    )
    .min(1, "No se recibió ninguna fila.")
    .max(400),
  // Tráfico de TIENDA por fecha. Va aparte de `entries` porque no es un dato de
  // persona: se escribe igual en la fila de cada asesor de ese día.
  traffic: z
    .array(
      z.object({
        date: z.string().min(10).max(10),
        value: z.union([z.number(), z.string()]).nullish()
      })
    )
    .max(40)
    .optional()
});

export async function POST(request: Request) {
  const unauthorized = requireAdminCapture(request);
  if (unauthorized) return unauthorized;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo invalido." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Cuerpo invalido.", detail: parsed.error.issues.map((issue) => issue.message) },
      { status: 400 }
    );
  }

  const store = await prisma.store.findUnique({ where: { id: parsed.data.storeId }, select: { id: true } });
  if (!store) return NextResponse.json({ error: "Tienda no encontrada." }, { status: 404 });

  const outcome = await captureKpis(parsed.data.storeId, parsed.data.entries, parsed.data.traffic ?? []);
  if (!outcome.ok) {
    return NextResponse.json({ error: "Hay filas invalidas.", detail: outcome.errors }, { status: 422 });
  }

  return NextResponse.json({ ok: true, ...outcome.result });
}
