import { NotificationType } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireCron } from "@/lib/cron-auth";
import { resolveMonterreyDate } from "@/lib/cron-time";
import { createNotifications, type NotificationInput } from "@/lib/notifications";
import { axoAttendancePeriodKey } from "@/lib/operational-checklist-reminders";
import { prisma } from "@/lib/prisma";
import { avisar, laboranHoy, telefonosDe } from "@/lib/whatsapp-canal";
import { enviarAvisoPorWhatsApp } from "@/lib/whatsapp-aviso";
import { enviarMediaPorWhatsApp } from "@/lib/whatsapp-media";
import { signR2Url } from "@/lib/r2";
import { expectedEntry } from "@/lib/attendance-sync";
import { PERSON_WHERE } from "@/lib/store-people";
import { ordenDelForms, resumenParaForms } from "@/lib/marcaje-forms";
import { filterUsersWithoutAlert, recordRetailAlerts, RETAIL_ALERT_TYPES } from "@/lib/retail-alert-log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Avisa solo a gerencia de las tiendas que tienen Forms configurado y aún no
 * confirmaron el envío de hoy. `stage=1050` es la última llamada antes de las
 * 11:00; lleva otro tipo de alerta para no quedar silenciada por la de 10:30.
 *
 * Desde el 8 nov 2026 corre una sola vez, a las 10:40, y además del aviso le
 * manda por WhatsApp a gerencia las fotos de entrada que el equipo mandó al bot
 * (`MarcajeFoto`), en el orden del Forms, y quién falta.
 */
export async function POST(request: Request) {
  const unauthorized = requireCron(request);
  if (unauthorized) return unauthorized;

  const stage = new URL(request.url).searchParams.get("stage") === "1050" ? "1050" : "1030";
  const alertType = stage === "1050"
    ? RETAIL_ALERT_TYPES.AXO_ATTENDANCE_1050
    : RETAIL_ALERT_TYPES.AXO_ATTENDANCE_1030;
  const today = resolveMonterreyDate();
  const periodKey = axoAttendancePeriodKey(today.dateKey);
  const stores = await prisma.store.findMany({
    where: { attendanceFormUrl: { not: null } },
    select: { id: true }
  });

  let sent = 0;
  let confirmed = 0;
  let fotos = 0;
  for (const store of stores) {
    const [delivery, managers] = await Promise.all([
      prisma.reportDelivery.findUnique({
        where: { storeId_periodKey: { storeId: store.id, periodKey } },
        select: { id: true }
      }),
      prisma.user.findMany({
        where: { storeId: store.id, role: { in: ["GERENTE", "SUBGERENTE"] }, active: true },
        select: { id: true }
      })
    ]);
    if (delivery) {
      confirmed += 1;
      continue;
    }
    const managerIds = managers.map((manager) => manager.id);
    if (managerIds.length === 0) continue;

    const title = stage === "1050" ? "Último aviso: asistencia AXO" : "Asistencia AXO pendiente";
    const body = stage === "1050"
      ? "Faltan 10 minutos. Envía el Forms de asistencia y confírmalo en Clarvex antes de las 11:00."
      : "Prepara las fotos del POS y del equipo, envía el Forms y confírmalo antes de las 11:00.";

    const recipients = await prisma.$transaction(async (tx) => {
      const pending = await filterUsersWithoutAlert(tx, {
        storeId: store.id,
        userIds: managerIds,
        periodKey: today.dateKey,
        alertType
      });
      if (pending.length === 0) return [];
      const notifications: NotificationInput[] = pending.map((userId) => ({
        storeId: store.id,
        userId,
        type: NotificationType.CHECKLIST_REMINDER,
        title,
        body
      }));
      await createNotifications(tx, notifications);
      await recordRetailAlerts(tx, {
        storeId: store.id,
        userIds: pending,
        periodKey: today.dateKey,
        alertType
      });
      return pending;
    });

    if (recipients.length === 0) continue;
    await avisar(recipients, {
      title,
      body,
      tag: `asistencia-axo-${stage}`,
      url: "/checklist"
    }).catch(() => undefined);
    sent += recipients.length;
    fotos += await mandarFotosParaForms(store.id, today.utcDate, recipients).catch((error) => {
      console.error("[attendance-axo-reminder] fotos", error instanceof Error ? error.message : error);
      return 0;
    });
  }

  return NextResponse.json({ ok: true, date: today.dateKey, stage, stores: stores.length, confirmed, sent, fotos });
}

/** Las fotos de entrada de hoy, a gerencia que labora, por WhatsApp. Devuelve cuántas salieron. */
async function mandarFotosParaForms(storeId: string, hoy: Date, gerencia: string[]): Promise<number> {
  const [turnos, marcajes] = await Promise.all([
    prisma.schedule.findMany({
      where: { storeId, date: hoy, status: { in: ["WORKING", "INVENTORY"] }, user: PERSON_WHERE },
      select: { startTime: true, user: { select: { id: true, name: true, role: true } } }
    }),
    prisma.marcajeFoto.findMany({
      where: { storeId, date: hoy, accion: "ENTRADA" },
      select: { userId: true, hora: true, url: true, mimeType: true }
    })
  ]);
  if (turnos.length === 0) return 0;
  const lugares = ordenDelForms(
    turnos.map((t) => ({ userId: t.user.id, name: t.user.name, role: t.user.role, expectedAt: expectedEntry(t.startTime) })),
    marcajes
  );
  const telefonos = await telefonosDe(gerencia);
  const laboran = await laboranHoy(gerencia, hoy);
  const firmadas = new Map<string, string | null>();
  for (const l of lugares) if (l.foto) firmadas.set(l.foto.url, await signR2Url(l.foto.url, 6 * 60 * 60));

  let enviadas = 0;
  for (const id of gerencia) {
    const phone = telefonos.get(id);
    if (!phone || !laboran.has(id)) continue;
    if (!(await enviarAvisoPorWhatsApp({ phone, text: resumenParaForms(lugares) }))) continue;
    for (const l of lugares) {
      const url = l.foto ? firmadas.get(l.foto.url) : null;
      if (!l.foto || !url) continue;
      await new Promise((r) => setTimeout(r, 1200));
      const ok = await enviarMediaPorWhatsApp({
        phone,
        mediaUrl: url,
        caption: `${l.etiqueta} — ${l.nombre} — ${l.foto.hora}`,
        mimetype: l.foto.mimeType,
        fileName: `${l.etiqueta.toLowerCase().replace(/\s+/g, "-")}-${l.nombre.toLowerCase()}.jpg`
      });
      if (ok) enviadas += 1;
    }
  }
  return enviadas;
}
