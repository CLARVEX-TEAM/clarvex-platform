import { NextResponse } from "next/server";
import { requireCron } from "@/lib/cron-auth";
import { resolveMonterreyDate } from "@/lib/cron-time";
import { prisma } from "@/lib/prisma";
import { enviarAvisoPorWhatsApp } from "@/lib/whatsapp-aviso";
import { cierreDeSemana, cierreDeSemanaTienda, lineaCampanaPersona, lineaCampanaTienda } from "@/lib/whatsapp-mensajes";
import { resumenDeSemana } from "@/lib/campana-datos";
import { tarjetaCierre } from "@/lib/whatsapp-tarjeta";
import { laboranHoy } from "@/lib/whatsapp-canal";
import {
  PAUSA_MS,
  cierreDeLaSemana,
  claveDia,
  domingoDe,
  enviarSemanal,
  esperar,
  telefonosDe,
  whatsappReemplazaPush
} from "@/lib/whatsapp-semanal";

/**
 * El cierre de la semana que terminó el sábado: a cada quien su venta y su
 * alcance por día, con tarjeta; a gerencia, además, el de la tienda.
 *
 * Corre cada hora el domingo y el lunes. Manda en cuanto el sábado está
 * capturado; si el lunes a mediodía sigue sin estarlo, manda igual diciendo
 * que hay días sin captura. Una semana a medias presentada como completa le
 * diría a alguien que no llegó a su meta por un día que nadie capturó.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ALERTA = "WA_CIERRE_SEMANA";
const ALERTA_TIENDA = "WA_CIERRE_TIENDA";
const DIA_MS = 86_400_000;

function horaMonterrey(): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Monterrey", hour: "numeric", hourCycle: "h23" }).format(new Date()));
}

export async function POST(request: Request) {
  const unauthorized = requireCron(request);
  if (unauthorized) return unauthorized;
  if (!whatsappReemplazaPush()) return NextResponse.json({ ok: true, apagado: true });

  const { utcDate: hoy, weekday } = resolveMonterreyDate();
  // Solo domingo (0) y lunes (1): después, el cierre ya no es noticia.
  if (weekday !== 0 && weekday !== 1) return NextResponse.json({ ok: true, fueraDeDia: true });
  const inicio = new Date(domingoDe(hoy).getTime() - 7 * DIA_MS);
  const fin = new Date(inicio.getTime() + 6 * DIA_MS);
  const semana = claveDia(inicio);
  const ultimaLlamada = weekday === 1 && horaMonterrey() >= 12;

  const stores = await prisma.store.findMany({ select: { id: true, name: true } });
  const resumen = { semana, tiendas: 0, tarjeta: 0, texto: 0, push: 0, esperando: 0, enEspera: 0 };

  for (const store of stores) {
    const { personas, sabadoCapturado } = await cierreDeLaSemana(store.id, inicio);
    if (personas.length === 0) continue;
    if (!sabadoCapturado && !ultimaLlamada) {
      resumen.esperando += 1;
      continue;
    }

    const yaEnviados = new Set(
      (
        await prisma.retailAlertLog.findMany({
          where: { storeId: store.id, periodKey: semana, alertType: { in: [ALERTA, ALERTA_TIENDA] } },
          select: { userId: true, alertType: true }
        })
      ).map((l) => `${l.alertType}|${l.userId}`)
    );
    const numero = await prisma.weeklyPerformanceClose.findUnique({
      where: { storeId_weekStart: { storeId: store.id, weekStart: inicio } },
      select: { weekNumber: true }
    });
    const kpiSemana = await prisma.kpi.findFirst({ where: { storeId: store.id, date: inicio }, select: { weekNumber: true } });
    const semanaNumero = numero?.weekNumber ?? kpiSemana?.weekNumber ?? 0;
    const telefonos = await telefonosDe(personas.map((p) => p.persona.id));
    const laboran = await laboranHoy(personas.map((p) => p.persona.id), hoy);
    // Tailored Help de esa misma semana, si la campaña está activa y tiene algo.
    const campana = await resumenDeSemana(store.id, inicio).catch(() => null);
    const conCampana = campana && (campana.meta > 0 || campana.total > 0) ? campana : null;
    resumen.tiendas += 1;
    let enviados = 0;

    for (const c of personas) {
      // Hoy no labora: se le guarda y le llega el siguiente día que labore.
      if (!laboran.has(c.persona.id)) {
        resumen.enEspera += 1;
        continue;
      }
      if (yaEnviados.has(`${ALERTA}|${c.persona.id}`)) continue;
      const lineaCampana = conCampana
        ? lineaCampanaPersona(conCampana.personas.find((p) => p.userId === c.persona.id)?.total ?? 0, conCampana.total, conCampana.meta)
        : null;
      const base = { nombre: c.persona.name, semana: semanaNumero, inicio, fin, dias: c.dias, ventaAnterior: c.ventaAnterior, campana: lineaCampana };
      if (enviados > 0) await esperar(PAUSA_MS);
      const via = await enviarSemanal({
        userId: c.persona.id,
        telefonos,
        texto: cierreDeSemana({ ...base, conTarjeta: true }),
        textoSinTarjeta: cierreDeSemana(base),
        tarjeta: () => tarjetaCierre({ ...base, tienda: store.name }),
        nombreArchivo: `cierre-semana-${semanaNumero}.png`,
        push: { title: `📊 Tu cierre de la semana ${semanaNumero}`, body: "Ya puedes ver cómo te fue cada día.", tag: `cierre-${semana}`, url: "/kpis" }
      });
      resumen[via] += 1;
      enviados += 1;
      await prisma.retailAlertLog.create({ data: { storeId: store.id, userId: c.persona.id, periodKey: semana, alertType: ALERTA } });
    }

    // Gerencia: además del suyo, el de la tienda. Solo texto: es una tabla
    // corta y lo que se busca es el ranking, no la tarjeta.
    const tienda = cierreDeSemanaTienda({
      semana: semanaNumero,
      inicio,
      fin,
      personas: personas.map((c) => ({
        nombre: c.persona.name,
        venta: c.dias.filter((d) => !d.descansa && d.capturado).reduce((t, d) => t + d.venta, 0),
        meta: c.dias.filter((d) => !d.descansa).reduce((t, d) => t + d.meta, 0)
      })),
      ventaAnterior: personas.reduce((t, c) => t + (c.ventaAnterior ?? 0), 0) || null,
      campana: conCampana ? lineaCampanaTienda(conCampana.total, conCampana.meta, conCampana.personas.filter((p) => p.total > 0)) : null
    });
    const gerencia = await prisma.user.findMany({
      where: { storeId: store.id, active: true, checklistOnly: false, role: { in: ["GERENTE", "SUBGERENTE"] } },
      select: { id: true }
    });
    const telGerencia = await telefonosDe(gerencia.map((g) => g.id));
    const gerenciaLabora = await laboranHoy(gerencia.map((g) => g.id), hoy);
    for (const g of gerencia) {
      if (!gerenciaLabora.has(g.id)) continue;
      const tel = telGerencia.get(g.id);
      if (!tel || yaEnviados.has(`${ALERTA_TIENDA}|${g.id}`)) continue;
      await esperar(PAUSA_MS);
      if (await enviarAvisoPorWhatsApp({ phone: tel, text: tienda })) {
        await prisma.retailAlertLog.create({ data: { storeId: store.id, userId: g.id, periodKey: semana, alertType: ALERTA_TIENDA } });
      }
    }
  }

  return NextResponse.json({ ok: true, ...resumen });
}
