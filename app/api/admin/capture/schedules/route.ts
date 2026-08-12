import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminCapture } from "@/lib/admin-capture-auth";
import { prisma } from "@/lib/prisma";
import { captureSchedules } from "@/lib/schedule-capture";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Una semana completa de una tienda son ~7 días × ~6 personas. Holgado de sobra.
export const maxDuration = 60;

/**
 * Captura manual de horarios desde el panel externo (Retool), sin sesión.
 *
 * Es la primera pieza del reemplazo de los Excel de Axo: la app deja de leer un
 * archivo ajeno y pasa a ser ella la fuente de verdad. Toda la validación vive
 * en `lib/schedule-capture` para que la futura pantalla de captura dentro de la
 * app reutilice exactamente las mismas reglas y no se abra una segunda
 * interpretación de lo que es un horario válido.
 */
const bodySchema = z.object({
  storeId: z.string().min(1).max(64),
  entries: z
    .array(
      z.object({
        employeeNumber: z.string().min(1).max(32),
        date: z.string().min(10).max(10),
        status: z.string().min(1).max(32),
        startTime: z.string().max(5).nullish(),
        endTime: z.string().max(5).nullish()
      })
    )
    // Un cuerpo vacío casi siempre es un fallo del panel, no una intención.
    .min(1, "No se recibió ninguna fila.")
    .max(500)
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

  const outcome = await captureSchedules(parsed.data.storeId, parsed.data.entries);
  if (!outcome.ok) {
    // 422 y no 400: el cuerpo tiene la forma correcta, lo que falla es el
    // contenido. El panel necesita distinguirlos para saber qué enseñar.
    return NextResponse.json({ error: "Hay filas invalidas.", detail: outcome.errors }, { status: 422 });
  }

  return NextResponse.json({ ok: true, ...outcome.result });
}
