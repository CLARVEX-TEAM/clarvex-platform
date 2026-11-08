import { prisma } from "@/lib/prisma";
import { retirarAvisosDelPendiente } from "@/lib/pendiente-cierre";
import type { CursoMatriz } from "@/lib/cursos-matriz";

/**
 * Una matriz de cursos se CIERRA SOLA al completar su último curso: cada curso
 * ya se validó con su certificado (la IA lo lee y el código comprueba curso y
 * nombre) o lo palomeó gerencia. Lo pidió Adrián: 6 de 6 no puede seguir
 * diciendo «en proceso».
 *
 * ⚠️ Los cursos se LEEN DE NUEVO aquí, después de guardar. Mandar los seis
 * certificados de golpe dispara seis webhooks a la vez; cada uno traía la lista
 * de antes y contaba «3 de 6» aunque ya fueran seis, así que nadie llegaba a
 * cerrarla. Releer después de la propia escritura garantiza que el último en
 * escribir vea la lista completa.
 *
 * ⚠️ Y el cambio de estatus es CONDICIONAL (`status != COMPLETADO`): si dos
 * llegan a la vez, solo uno lo cierra y solo ese avisa a gerencia.
 */
export async function cerrarMatrizSiTermino(storeId: string, pendingId: string): Promise<{ cerrada: boolean; cursos: CursoMatriz[] }> {
  const cursos = await prisma.pendingCurso.findMany({
    where: { pendingId },
    select: { id: true, orden: true, nombre: true, completadoAt: true },
    orderBy: { orden: "asc" }
  });
  if (cursos.length === 0 || cursos.some((c) => !c.completadoAt)) return { cerrada: false, cursos };
  const cerrada = await prisma.$transaction(async (tx) => {
    const r = await tx.pending.updateMany({
      where: { id: pendingId, storeId, status: { not: "COMPLETADO" } },
      data: { status: "COMPLETADO", cierreSolicitadoAt: null }
    });
    if (r.count === 0) return false;
    const p = await tx.pending.findUnique({ where: { id: pendingId }, select: { title: true, ownerId: true } });
    if (p) await retirarAvisosDelPendiente(tx, storeId, p);
    return true;
  });
  return { cerrada, cursos };
}

/** Si gerencia desmarca un curso de una matriz ya cerrada, vuelve a estar en proceso. */
export async function reabrirMatrizSiFalta(storeId: string, pendingId: string): Promise<void> {
  const falta = await prisma.pendingCurso.count({ where: { pendingId, completadoAt: null } });
  if (falta > 0) {
    await prisma.pending.updateMany({ where: { id: pendingId, storeId, status: "COMPLETADO" }, data: { status: "EN_PROCESO" } });
  }
}
