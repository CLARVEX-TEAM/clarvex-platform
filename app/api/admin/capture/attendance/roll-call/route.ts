import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminCapture } from "@/lib/admin-capture-auth";
import { rollCall } from "@/lib/attendance-roll-call";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Pase de lista: "sin novedad" marca a su hora a todo el que tenia turno, y
 * solo se nombra la excepcion.
 *
 * Existe para capturar desde el telefono sin teclear cinco filas cuando lo
 * normal es que nadie llegue tarde. Las reglas de puntualidad NO cambian: las
 * aplica `captureAttendance`, igual que la captura de Retool.
 */
const bodySchema = z.object({
  storeId: z.string().min(1).max(64),
  date: z.string().length(10),
  exceptions: z
    .array(
      z.object({
        employeeNumber: z.string().min(1).max(32),
        arrivedAt: z.string().max(5).nullish(),
        entryText: z.string().max(40).nullish(),
        note: z.string().max(300).nullish()
      })
    )
    .max(50)
    .optional()
    .default([])
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

  const outcome = await rollCall(parsed.data.storeId, parsed.data.date, parsed.data.exceptions);
  if (!outcome.ok) {
    return NextResponse.json({ error: "No se pudo pasar lista.", detail: outcome.errors }, { status: 422 });
  }

  return NextResponse.json({ ok: true, ...outcome.result });
}
