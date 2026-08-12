import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminCapture } from "@/lib/admin-capture-auth";
import { captureAttendance } from "@/lib/attendance-capture";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Captura manual de asistencia desde el panel externo (Retool), sin sesión.
 *
 * Sustituye a la hoja APERTURA. Se guarda con `source: "MANUAL"`, que el
 * importador del archivo respeta y no pisa.
 */
const bodySchema = z.object({
  storeId: z.string().min(1).max(64),
  entries: z
    .array(
      z.object({
        employeeNumber: z.string().min(1).max(32),
        date: z.string().min(10).max(10),
        arrivedAt: z.string().max(5).nullish(),
        lunchStart: z.string().max(5).nullish(),
        leftAt: z.string().max(5).nullish(),
        entryText: z.string().max(40).nullish(),
        note: z.string().max(300).nullish()
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

  const outcome = await captureAttendance(parsed.data.storeId, parsed.data.entries);
  if (!outcome.ok) {
    return NextResponse.json({ error: "Hay filas invalidas.", detail: outcome.errors }, { status: 422 });
  }

  return NextResponse.json({ ok: true, ...outcome.result });
}
