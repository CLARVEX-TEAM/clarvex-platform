import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminCapture } from "@/lib/admin-capture-auth";
import { captureGoals, previewGoals } from "@/lib/goal-capture";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Siembra las metas diarias desde la «Cuota Justa» pegada desde Excel.
 *
 * `preview: true` no escribe nada: devuelve exactamente lo que se guardaría.
 * Existe porque sembrar una semana entera de metas equivocadas es fácil de hacer
 * y molesto de deshacer — quien captura tiene que poder verlo antes.
 */
const bodySchema = z.object({
  storeId: z.string().min(1).max(64),
  // El pegado de una semana ronda los 2 KB; el techo deja margen de sobra sin
  // aceptar que alguien pegue un archivo entero por error.
  text: z.string().min(1).max(200_000),
  preview: z.boolean().optional()
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

  if (parsed.data.preview) {
    const outcome = await previewGoals(parsed.data.storeId, parsed.data.text);
    if (!outcome.ok) {
      return NextResponse.json({ error: "No se pudo leer la Cuota Justa.", detail: outcome.errors }, { status: 422 });
    }
    return NextResponse.json({ ok: true, preview: outcome.result });
  }

  const outcome = await captureGoals(parsed.data.storeId, parsed.data.text);
  if (!outcome.ok) {
    return NextResponse.json({ error: "No se pudieron sembrar las metas.", detail: outcome.errors }, { status: 422 });
  }
  return NextResponse.json({ ok: true, ...outcome.result });
}
