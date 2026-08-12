import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminCapture } from "@/lib/admin-capture-auth";
import { captureDiscounts } from "@/lib/discount-capture";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Captura manual del margen DTO desde el panel externo (Retool), sin sesión.
 *
 * Solo acepta venta bruta y descuento; el margen se deriva. Escribe sobre KPIs
 * que YA existan de esa semana (patrón de fila ancla) — ver `lib/discount-capture`.
 */
const bodySchema = z.object({
  storeId: z.string().min(1).max(64),
  entries: z
    .array(
      z.object({
        employeeNumber: z.string().min(1).max(32),
        weekNumber: z.union([z.number(), z.string()]),
        grossSales: z.union([z.number(), z.string()]).nullish(),
        discountAmount: z.union([z.number(), z.string()]).nullish()
      })
    )
    .min(1, "No se recibió ninguna fila.")
    .max(200)
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

  const outcome = await captureDiscounts(parsed.data.storeId, parsed.data.entries);
  if (!outcome.ok) {
    return NextResponse.json({ error: "Hay filas invalidas.", detail: outcome.errors }, { status: 422 });
  }

  return NextResponse.json({ ok: true, ...outcome.result });
}
