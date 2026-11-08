import { NextResponse } from "next/server";
import { z } from "zod";
import { isApiError, parseJson, requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { serializePending } from "@/lib/pending";
import { cerrarMatrizSiTermino, reabrirMatrizSiFalta } from "@/lib/matriz-cierre";

export const dynamic = "force-dynamic";

/**
 * Gerencia marca o desmarca un curso de una matriz a mano: para cuando el bot
 * no pudo (certificado a otro nombre, foto ilegible) o se marcó por error.
 * La persona no puede: su camino es mandar el certificado al bot.
 */
const cuerpo = z.object({ cursoId: z.string().min(1), hecho: z.boolean() });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession(["GERENTE", "SUBGERENTE"]);
  if (isApiError(session)) return session;
  const parsed = await parseJson(request, cuerpo);
  if ("response" in parsed) return parsed.response;

  const curso = await prisma.pendingCurso.findFirst({ where: { id: parsed.data.cursoId, pendingId: id, pending: { storeId: session.storeId } } });
  if (!curso) return NextResponse.json({ error: "Curso no encontrado." }, { status: 404 });
  await prisma.pendingCurso.update({
    where: { id: curso.id },
    data: parsed.data.hecho ? { completadoAt: curso.completadoAt ?? new Date() } : { completadoAt: null, evidenceId: null }
  });
  // Palomear el último cierra la matriz; desmarcar uno de una cerrada la reabre.
  if (parsed.data.hecho) await cerrarMatrizSiTermino(session.storeId, id);
  else await reabrirMatrizSiFalta(session.storeId, id);
  const pending = await prisma.pending.findUnique({ where: { id }, include: { cursos: true } });
  return NextResponse.json({ pending: pending ? serializePending(pending) : null });
}
