import { NextResponse } from "next/server";
import { requireCron } from "@/lib/cron-auth";
import { resolveMonterreyDate } from "@/lib/cron-time";
import { prisma } from "@/lib/prisma";
import { metasDeLaSemana as textoMetas } from "@/lib/whatsapp-mensajes";
import { tarjetaMetas } from "@/lib/whatsapp-tarjeta";
import {
  PAUSA_MS,
  claveDia,
  enviarSemanal,
  esperar,
  metasDeLaSemana,
  telefonosDe,
  whatsappReemplazaPush
} from "@/lib/whatsapp-semanal";

/**
 * «Ya están tus metas de la semana», a cada quien por WhatsApp con su tarjeta.
 *
 * Corre cada 15 minutos y manda cuando Cuota Justa lleva 15 minutos sin
 * guardarse: así, cinco guardados seguidos no son cinco mensajes.
 *
 * ⚠️ **La huella decide, no la hora.** Se guarda una por persona y semana en
 * `RetailAlertLog`; si las metas de alguien cambian después, le llega «se
 * actualizaron tus metas», y si no cambian, un guardado más no le manda nada.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ALERTA = "WA_METAS_SEMANA";
const ESPERA_MS = 15 * 60_000;

export async function POST(request: Request) {
  const unauthorized = requireCron(request);
  if (unauthorized) return unauthorized;
  if (!whatsappReemplazaPush()) return NextResponse.json({ ok: true, apagado: true });

  const { utcDate: hoy } = resolveMonterreyDate();
  const cierres = await prisma.weeklyPerformanceClose.findMany({
    where: { quotaSavedAt: { not: null, lte: new Date(Date.now() - ESPERA_MS) }, weekEnd: { gte: hoy } },
    select: { storeId: true, weekStart: true, weekEnd: true, weekNumber: true, store: { select: { name: true } } }
  });

  const resumen = { semanas: cierres.length, tarjeta: 0, texto: 0, push: 0, sinCambios: 0 };

  for (const cierre of cierres) {
    const semana = claveDia(cierre.weekStart);
    const metas = await metasDeLaSemana(cierre.storeId, cierre.weekStart);
    const previos = await prisma.retailAlertLog.findMany({
      where: { storeId: cierre.storeId, alertType: ALERTA, periodKey: { startsWith: `${semana}:` } },
      select: { userId: true, periodKey: true }
    });
    const telefonos = await telefonosDe(metas.map((m) => m.persona.id));
    let enviados = 0;

    for (const m of metas) {
      const clave = `${semana}:${m.huella}`;
      const suyos = previos.filter((p) => p.userId === m.persona.id);
      if (suyos.some((p) => p.periodKey === clave)) {
        resumen.sinCambios += 1;
        continue;
      }
      const actualizacion = suyos.length > 0;
      const base = { nombre: m.persona.name, semana: cierre.weekNumber, inicio: cierre.weekStart, fin: cierre.weekEnd, dias: m.dias, actualizacion };

      if (enviados > 0) await esperar(PAUSA_MS);
      const via = await enviarSemanal({
        userId: m.persona.id,
        telefonos,
        texto: textoMetas({ ...base, conTarjeta: true }),
        textoSinTarjeta: textoMetas(base),
        tarjeta: () => tarjetaMetas({ ...base, tienda: cierre.store.name }),
        nombreArchivo: `metas-semana-${cierre.weekNumber}.png`,
        push: {
          title: actualizacion ? "🔄 Se actualizaron tus metas" : `🎯 Tus metas de la semana ${cierre.weekNumber}`,
          body: "Ya puedes ver tu meta de cada día.",
          tag: `metas-${semana}`,
          url: "/kpis"
        }
      });
      resumen[via] += 1;
      enviados += 1;

      await prisma.retailAlertLog.create({
        data: { storeId: cierre.storeId, userId: m.persona.id, periodKey: clave, alertType: ALERTA }
      });
    }
  }

  return NextResponse.json({ ok: true, ...resumen });
}
