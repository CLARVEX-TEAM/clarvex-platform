import { prisma } from "@/lib/prisma";
import { dispatchPushToUsers, type PushPayload } from "@/lib/push";
import { enviarAvisoPorWhatsApp } from "@/lib/whatsapp-aviso";
import { formatoGenerico } from "@/lib/whatsapp-formato";
import { todayInMonterrey } from "@/lib/mexico-timezone";

/**
 * Avisos automáticos por WhatsApp EN LUGAR de la notificación.
 *
 * El equipo recibía lo mismo dos veces --la notificación de Chrome/la app y el
 * WhatsApp del bot-- y en WhatsApp sí queda historial. Quien tiene su número en
 * `UserPhone` recibe el aviso solo por WhatsApp; los demás, la notificación de
 * siempre. La campana de la app no cambia: la notificación interna se sigue
 * creando aparte.
 *
 * ⚠️ **Si WhatsApp falla, cae a la notificación.** Evolution corre sobre un
 * número normal, no la API oficial: puede estar desconectada. Un aviso que no
 * llega por ningún lado es peor que uno que llega por el canal de antes.
 *
 * ⚠️ **Se enciende con `WA_REEMPLAZA_PUSH=1`.** Sin ella todo sigue por
 * notificación, así que desplegar no cambia nada hasta decidirlo, y volver
 * atrás es quitar una variable --sin desplegar otra vez--.
 *
 * Solo para avisos programados. Los de la app (chat, reacciones, comentarios)
 * siguen por notificación: por WhatsApp duplicarían el chat.
 */

/** Pausa entre mensajes: ráfagas a muchos números son lo que hace que WhatsApp bloquee uno no oficial. */
const PAUSA_MS = 1500;

export function whatsappReemplazaPush(): boolean {
  return process.env.WA_REEMPLAZA_PUSH === "1";
}

export async function telefonosDe(userIds: string[]): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  // `UserPhone` se creó a mano y no está en el esquema de Prisma. Una baja no
  // recibe avisos aunque conserve su número: mismo filtro que la notificación.
  const filas = await prisma.$queryRaw<Array<{ userId: string; phone: string }>>`
    SELECT up."userId", up.phone
    FROM "UserPhone" up
    JOIN "User" u ON u.id = up."userId"
    WHERE up."userId" = ANY(${userIds}) AND u.active = true
  `;
  return new Map(filas.map((f) => [f.userId, f.phone]));
}

const esperar = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Lo que NO es laborar: a quien hoy tiene esto no le llega ningún aviso. */
export const NO_LABORA = new Set(["OFF", "VACATION", "PAID_DAY", "TERMINATED"]);

/**
 * De `userIds`, quiénes pueden recibir avisos HOY: los que laboran.
 *
 * ⚠️ Regla de Adrián (7 nov 2026): en su día de descanso, vacaciones o pago de
 * día nadie recibe avisos de la tienda. Ese día Itzel tenía pago de día y le
 * llegaron el resumen de la mañana, el de media jornada y el reporte de venta.
 *
 * Quien NO tiene horario capturado hoy sí recibe: hay tiendas que no capturan
 * horarios, y callarlas por eso las dejaría sin ningún aviso.
 */
export async function laboranHoy(userIds: string[], hoy: Date = todayInMonterrey()): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const libres = await prisma.schedule.findMany({
    where: { userId: { in: userIds }, date: hoy, status: { in: [...NO_LABORA] as Array<"OFF" | "VACATION" | "PAID_DAY" | "TERMINATED"> } },
    select: { userId: true }
  });
  const fuera = new Set(libres.map((l) => l.userId));
  return new Set(userIds.filter((id) => !fuera.has(id)));
}

export type AvisoProgramado = PushPayload & {
  /** Texto propio para WhatsApp; sin él se arma uno a partir del título y el cuerpo. */
  whatsapp?: string | ((userId: string) => string | null);
};

/**
 * Devuelve cuántos salieron por cada canal, para el resumen del cron.
 */
export async function avisar(userIds: string[], aviso: AvisoProgramado): Promise<{ whatsapp: number; push: number }> {
  const { whatsapp, ...payload } = aviso;
  // Solo a quien labora hoy, por WhatsApp Y por notificación: un aviso en su
  // día libre molesta igual llegue por donde llegue.
  const laboran = process.env.NODE_ENV === "test" ? new Set(userIds) : await laboranHoy([...new Set(userIds)]);
  const unicos = [...new Set(userIds)].filter((id) => laboran.has(id));
  if (unicos.length === 0) return { whatsapp: 0, push: 0 };

  if (!whatsappReemplazaPush() || process.env.NODE_ENV === "test") {
    await dispatchPushToUsers(unicos, payload);
    return { whatsapp: 0, push: unicos.length };
  }

  const telefonos = await telefonosDe(unicos);
  const porPush = unicos.filter((id) => !telefonos.has(id));
  let enviados = 0;

  for (const id of unicos) {
    const telefono = telefonos.get(id);
    if (!telefono) continue;
    const propio = typeof whatsapp === "function" ? whatsapp(id) : whatsapp;
    const texto = propio ?? formatoGenerico(payload);
    if (enviados > 0) await esperar(PAUSA_MS);
    const ok = await enviarAvisoPorWhatsApp({ phone: telefono, text: texto });
    if (ok) enviados += 1;
    else porPush.push(id);
  }

  if (porPush.length) await dispatchPushToUsers(porPush, payload);
  return { whatsapp: enviados, push: porPush.length };
}
