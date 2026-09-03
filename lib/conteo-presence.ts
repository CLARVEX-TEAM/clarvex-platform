/**
 * Presencia en vivo de conteos: quién está contando qué marbete.
 *
 * ⚠️ **Vive en la BASE, no en memoria, y el cambio arregla un fallo real.** La
 * versión anterior usaba un `Map` de proceso, justificado con el comentario
 * «válido porque la app corre en un solo proceso PM2». No es cierto: PM2 corre
 * en **cluster con dos instancias**. El latido caía en un proceso y la lectura
 * en el otro, así que la presencia aparecía y desaparecía sola según a quién le
 * tocara atender cada petición — que es exactamente el síntoma de «no se ve en
 * vivo».
 *
 * Sigue siendo desechable: se limpia por tiempo, nadie la consulta después y
 * perderla entera no rompe nada.
 */

import { prisma } from "@/lib/prisma";

/** Sin latido en este tiempo, deja de mostrarse. */
export const TTL_MS = 12_000;

/**
 * Clave del conteo diario.
 *
 * ⚠️ NO se puede usar el `CycleCount.id`: la fila del día **no existe hasta que
 * alguien guarda el primer marbete**, y justo antes de eso es cuando más falta
 * hace saber quién está contando. Se arma con lo que sí se conoce siempre.
 */
export function claveDiario(storeId: string, section: string, date: string): string {
  return `diario:${storeId}:${section}:${date}`;
}

/** Clave del conteo físico, que sí tiene fila desde que se abre. */
export function claveFisico(countId: string): string {
  return `fisico:${countId}`;
}

export type Presente = { userId: string; userName: string; tagNumber: number | null };

/** Marca que esta persona sigue ahí, y en qué marbete. */
export async function latir(
  countKey: string,
  userId: string,
  userName: string,
  tagNumber: number | null
): Promise<void> {
  const at = new Date();
  await prisma.countPresence.upsert({
    where: { countKey_userId: { countKey, userId } },
    create: { countKey, userId, userName, tagNumber },
    update: { userName, tagNumber, at }
  });
}

/** Se fue: al cerrar la pantalla, para no esperar a que caduque. */
export async function retirar(countKey: string, userId: string): Promise<void> {
  await prisma.countPresence.deleteMany({ where: { countKey, userId } });
}

/**
 * Quién más está en este conteo.
 *
 * `excluir` deja fuera a quien pregunta: verse a uno mismo en la lista de «quién
 * está contando» no aporta nada y confunde.
 */
export async function presentes(countKey: string, excluir?: string): Promise<Presente[]> {
  const desde = new Date(Date.now() - TTL_MS);

  const filas = await prisma.countPresence.findMany({
    where: { countKey, at: { gte: desde }, ...(excluir ? { userId: { not: excluir } } : {}) },
    select: { userId: true, userName: true, tagNumber: true },
    orderBy: { at: "desc" }
  });

  /*
   * El barrido de caducados va aquí y no en un cron: la tabla solo crece cuando
   * alguien cuenta, y quien lee es exactamente quien tiene interés en que esté
   * limpia. Es `deleteMany` sin esperar respuesta porque si falla no pasa nada
   * —la consulta de arriba ya filtra por tiempo— y no debe retrasar la
   * respuesta.
   */
  void prisma.countPresence
    .deleteMany({ where: { countKey, at: { lt: desde } } })
    .catch(() => {});

  return filas.map((f) => ({ userId: f.userId, userName: f.userName, tagNumber: f.tagNumber }));
}
