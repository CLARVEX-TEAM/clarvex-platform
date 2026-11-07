import { NextResponse } from "next/server";
import { requireCron } from "@/lib/cron-auth";
import { resolveMonterreyDate } from "@/lib/cron-time";
import { prisma } from "@/lib/prisma";
import { reconstructRdvWeek } from "@/lib/rdv-week";
import { horariosDeLaSemana as textoHorarios } from "@/lib/whatsapp-mensajes";
import { tarjetaHorarios } from "@/lib/whatsapp-tarjeta";
import { laboranHoy } from "@/lib/whatsapp-canal";
import {
  PAUSA_MS,
  claveDia,
  domingoDe,
  enviarSemanal,
  esperar,
  horariosDeLaSemana,
  telefonosDe,
  whatsappReemplazaPush
} from "@/lib/whatsapp-semanal";
import { enHorarioDeAvisos } from "@/lib/horario-avisos";

/**
 * «Ya están tus horarios», a cada quien por WhatsApp con su tarjeta, cuando
 * gerencia sube los horarios de esta semana o de la siguiente.
 *
 * Mismo diseño que las metas: corre cada 15 minutos, espera 15 desde el último
 * cambio (subir una semana son muchos guardados) y decide por HUELLA. A quien
 * le cambian el horario después le llega «se actualizó tu horario»; a quien no
 * le cambió nada, nada.
 *
 * ⚠️ **Solo cambios RECIENTES (48 h).** Encenderlo no puede repartir los
 * horarios que se subieron hace días: esa semana ya la conocen.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ALERTA = "WA_HORARIOS_SEMANA";
const ESPERA_MS = 15 * 60_000;
// 7 días: a quien descansa se le guarda el aviso para su siguiente día laboral.
const VENTANA_MS = 7 * 24 * 3_600_000;
const DIA_MS = 86_400_000;

export async function POST(request: Request) {
  const unauthorized = requireCron(request);
  if (unauthorized) return unauthorized;
  if (!whatsappReemplazaPush()) return NextResponse.json({ ok: true, apagado: true });
  if (!enHorarioDeAvisos()) return NextResponse.json({ ok: true, fueraDeHorario: true });

  const { utcDate: hoy } = resolveMonterreyDate();
  const estaSemana = domingoDe(hoy);
  const semanas = [estaSemana, new Date(estaSemana.getTime() + 7 * DIA_MS)];
  const ahora = Date.now();
  const stores = await prisma.store.findMany({ select: { id: true, name: true } });
  const resumen = { tarjeta: 0, texto: 0, push: 0, sinCambios: 0, enEspera: 0, semanas: [] as string[] };

  for (const store of stores) {
    for (const inicio of semanas) {
      const { personas, ultimoCambio } = await horariosDeLaSemana(store.id, inicio);
      if (!ultimoCambio || personas.length === 0) continue;
      const hace = ahora - ultimoCambio.getTime();
      // Todavía guardando, o un cambio viejo: no se manda nada.
      if (hace < ESPERA_MS || hace > VENTANA_MS) continue;

      const semana = claveDia(inicio);
      resumen.semanas.push(`${store.id}:${semana}`);
      const fin = new Date(inicio.getTime() + 6 * DIA_MS);
      const previos = await prisma.retailAlertLog.findMany({
        where: { storeId: store.id, alertType: ALERTA, periodKey: { startsWith: `${semana}:` } },
        select: { userId: true, periodKey: true }
      });
      const telefonos = await telefonosDe(personas.map((p) => p.persona.id));
      const laboran = await laboranHoy(personas.map((p) => p.persona.id), hoy);
      let enviados = 0;

      for (const h of personas) {
        // Hoy no labora: se le guarda y le llega el siguiente día que labore.
        if (!laboran.has(h.persona.id)) {
          resumen.enEspera += 1;
          continue;
        }
        const clave = `${semana}:${h.huella}`;
        const suyos = previos.filter((p) => p.userId === h.persona.id);
        if (suyos.some((p) => p.periodKey === clave)) {
          resumen.sinCambios += 1;
          continue;
        }
        // La semana retail de la tienda (domingo a sábado), numerada como en el RDV.
        const base = { nombre: h.persona.name, semana: reconstructRdvWeek(inicio).weekNumber, inicio, fin, dias: h.dias, actualizacion: suyos.length > 0 };
        if (enviados > 0) await esperar(PAUSA_MS);
        const via = await enviarSemanal({
          userId: h.persona.id,
          telefonos,
          texto: textoHorarios({ ...base, conTarjeta: true }),
          textoSinTarjeta: textoHorarios(base),
          tarjeta: () => tarjetaHorarios({ ...base, tienda: store.name }),
          nombreArchivo: `horarios-${semana}.png`,
          push: {
            title: base.actualizacion ? "🔄 Se actualizó tu horario" : "🗓️ Ya están tus horarios",
            body: "Ya puedes ver tu semana en Horarios.",
            tag: `horarios-${semana}`,
            url: "/horarios"
          }
        });
        resumen[via] += 1;
        enviados += 1;
        await prisma.retailAlertLog.create({ data: { storeId: store.id, userId: h.persona.id, periodKey: clave, alertType: ALERTA } });
      }
    }
  }

  return NextResponse.json({ ok: true, ...resumen });
}
