import { NextResponse } from "next/server";
import { requireCron } from "@/lib/cron-auth";
import { resolveMonterreyDate } from "@/lib/cron-time";
import { prisma } from "@/lib/prisma";
import { reconstructRdvWeek } from "@/lib/rdv-week";
import { claveFecha } from "@/lib/campana";
import { acumuladoCampana, campanaActual, resumenDeSemana } from "@/lib/campana-datos";
import { avisar, whatsappReemplazaPush } from "@/lib/whatsapp-canal";
import { enviarMediaPorWhatsApp } from "@/lib/whatsapp-media";
import { enviarAvisoPorWhatsApp } from "@/lib/whatsapp-aviso";
import { firstName } from "@/lib/weekly-close";
import { appUrl, pesos } from "@/lib/whatsapp-formato";
import { tarjetaCampana } from "@/lib/whatsapp-tarjeta";

/**
 * Tailored Help, una vez al día (6 pm de Monterrey):
 *
 * 1. **Si vamos bajos**, aviso en privado a quien trabaja hoy. «Bajos» es ir
 *    debajo del 85 % de la meta de los días YA CAPTURADOS de la semana: un día
 *    que gerencia todavía no registra no puede sonar como un día sin donativos.
 * 2. **Cada 4 días**, cómo va la tienda al grupo, con tarjeta y el RANKING de
 *    todos, gerencia incluida: todos piden donativos en caja. Es la única
 *    excepción a «en el grupo solo comunicados», y las dos cosas las pidió Adrián.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UMBRAL = 0.85;
const CADA_DIAS = 4;
const DIA_MS = 86_400_000;
const TRABAJA = new Set(["WORKING", "INVENTORY"]);

function grupoDe(storeId: string): string | null {
  const jid = process.env.WHATSAPP_ANNOUNCE_GROUP_JID ?? "";
  const tiendas = (process.env.WHATSAPP_ANNOUNCE_STORE_IDS ?? "").split(",").map((s) => s.trim());
  return jid && tiendas.includes(storeId) ? jid : null;
}

export async function POST(request: Request) {
  const unauthorized = requireCron(request);
  if (unauthorized) return unauthorized;
  if (!whatsappReemplazaPush()) return NextResponse.json({ ok: true, apagado: true });

  const campana = await campanaActual();
  const { utcDate: hoy, dateKey } = resolveMonterreyDate();
  if (!campana || !campana.active || hoy < campana.startDate || (campana.endDate && hoy > campana.endDate)) {
    return NextResponse.json({ ok: true, sinCampana: true });
  }
  const diaDeCampana = Math.round((hoy.getTime() - campana.startDate.getTime()) / DIA_MS);
  const tocaGrupo = diaDeCampana > 0 && diaDeCampana % CADA_DIAS === 0;

  const tiendas = await prisma.campaignGoal.findMany({ where: { campaignId: campana.id }, distinct: ["storeId"], select: { storeId: true } });
  const resumen = { avisosBajos: 0, grupos: 0, tiendas: tiendas.length, tocaGrupo };

  for (const { storeId } of tiendas) {
    const semana = await resumenDeSemana(storeId, hoy);
    if (!semana) continue;
    const ayer = claveFecha(new Date(hoy.getTime() - DIA_MS));

    // ── 1. ¿Vamos bajos? Solo con días capturados, hasta ayer. ──────────
    const contados = semana.dias.filter((d) => d.capturado && d.fecha <= ayer);
    const metaContada = contados.reduce((t, d) => t + d.meta, 0);
    const totalContado = contados.reduce((t, d) => t + d.total, 0);
    if (metaContada > 0 && totalContado / metaContada < UMBRAL) {
      const yaAvisados = new Set(
        (await prisma.dailyNotificationLog.findMany({ where: { date: dateKey, type: "WA_CAMPANA_BAJA" }, select: { employeeId: true } })).map((l) => l.employeeId)
      );
      const hoyTrabajan = await prisma.schedule.findMany({
        where: { storeId, date: hoy, user: { active: true, checklistOnly: false } },
        select: { userId: true, status: true, user: { select: { name: true } } }
      });
      const faltan = metaContada - totalContado;
      const pct = Math.round((totalContado / metaContada) * 100);
      for (const h of hoyTrabajan.filter((x) => TRABAJA.has(x.status) && !yaAvisados.has(x.userId))) {
        const propio = semana.personas.find((p) => p.userId === h.userId)?.total ?? 0;
        const texto = [
          `💙 *Tailored Help · vamos un poco abajo*`,
          "",
          `Hola ${firstName(h.user.name)} 👋 esta semana la tienda lleva *${pesos(totalContado)}* de ${pesos(metaContada)} (${pct} %).`,
          `Nos faltan *${pesos(faltan)}* para ir en meta. Tú llevas ${pesos(propio)} esta semana.`,
          "",
          "Hoy invita a donar en caja: cada peso es para la escuela Christel House. ¡Juntos construimos futuros! 🙌",
          "",
          `👉 ${appUrl("/campanas/tailored-help")}`
        ].join("\n");
        await avisar([h.userId], {
          title: "💙 Tailored Help: vamos un poco abajo",
          body: `La tienda lleva ${pct} % de la meta; faltan ${pesos(faltan)}.`,
          tag: `campana-${dateKey}`,
          url: "/campanas/tailored-help",
          whatsapp: texto
        });
        await prisma.dailyNotificationLog.create({ data: { employeeId: h.userId, date: dateKey, type: "WA_CAMPANA_BAJA" } });
        resumen.avisosBajos += 1;
      }
    }

    // ── 2. Cada 4 días, al grupo. ────────────────────────────────────────
    const grupo = grupoDe(storeId);
    if (tocaGrupo && grupo) {
      const ya = await prisma.dailyNotificationLog.findUnique({
        where: { employeeId_date_type: { employeeId: storeId, date: dateKey, type: "WA_CAMPANA_GRUPO" } }
      });
      if (!ya) {
        const [store, acumulado] = await Promise.all([
          prisma.store.findUnique({ where: { id: storeId }, select: { name: true } }),
          acumuladoCampana(storeId)
        ]);
        const pct = semana.meta > 0 ? Math.round((semana.total / semana.meta) * 100) : null;
        // Ranking de TODOS --gerencia y asesores--: todos piden donativos en caja.
        const ranking = semana.personas.map((p) => ({ nombre: p.nombre, total: p.total, donativos: p.donativos }));
        const medalla = (i: number) => (i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`);
        const pie = [
          `💙 *Tailored Help · así vamos*`,
          "",
          `Esta semana llevamos *${pesos(semana.total)}* de ${pesos(semana.meta)}${pct === null ? "" : ` (${pct} %)`}.`,
          `Desde que arrancó la campaña: *${pesos(acumulado?.tienda ?? 0)}* para la escuela Christel House.`,
          "",
          "*Ranking de la semana*",
          ...ranking.map((p, i) => `${medalla(i)} ${firstName(p.nombre)}: *${pesos(p.total)}*`),
          "",
          "¡Gracias a todos! Gerencia y asesores, sigamos invitando a donar en caja. 🙌"
        ].join("\n");
        let ok = false;
        try {
          const siguiente = await resumenDeSemana(storeId, new Date(hoy.getTime() + 7 * DIA_MS)).catch(() => null);
          const png = await tarjetaCampana({
            tienda: store?.name ?? "",
            semana: reconstructRdvWeek(hoy).weekNumber,
            dias: semana.dias.map((d) => ({ fecha: new Date(`${d.fecha}T00:00:00Z`), meta: d.meta, total: d.total, capturado: d.capturado })),
            proximaMeta: siguiente && siguiente.meta > 0 ? siguiente.meta : null,
            ranking,
            totalSemana: semana.total,
            metaSemana: semana.meta,
            totalCampana: acumulado?.tienda ?? 0
          });
          ok = await enviarMediaPorWhatsApp({ phone: grupo, mediaUrl: png.toString("base64"), caption: pie, mimetype: "image/png", fileName: "tailored-help.png" });
        } catch (error) {
          console.error("[wa-campana] tarjeta", error instanceof Error ? error.message : error);
        }
        if (!ok) ok = await enviarAvisoPorWhatsApp({ phone: grupo, text: pie });
        if (ok) {
          await prisma.dailyNotificationLog.create({ data: { employeeId: storeId, date: dateKey, type: "WA_CAMPANA_GRUPO" } });
          resumen.grupos += 1;
        }
      }
    }
  }

  return NextResponse.json({ ok: true, dia: diaDeCampana, ...resumen });
}
