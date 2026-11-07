import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolveMonterreyDate } from "@/lib/cron-time";
import { campanaActual } from "@/lib/campana-datos";
import { claveFecha } from "@/lib/campana";
import { firstName } from "@/lib/weekly-close";
import { pesos } from "@/lib/whatsapp-formato";
import { whatsappReemplazaPush } from "@/lib/whatsapp-canal";
import { enHorarioDeAvisos } from "@/lib/horario-avisos";
import { enviarMediaPorWhatsApp } from "@/lib/whatsapp-media";
import { enviarAvisoPorWhatsApp } from "@/lib/whatsapp-aviso";
import { reconstructRdvWeek } from "@/lib/rdv-week";
import { fechaLarga, pendientes, type Reconocimiento } from "@/lib/reconocimientos";
import { tarjetaReconocimiento } from "@/lib/whatsapp-reconocimiento";

/**
 * Manda al grupo de la tienda los reconocimientos de Tailored Help que toquen.
 *
 * Se llama al GUARDAR donativos --así la felicitación llega el mismo día-- y
 * desde el cron diario de la campaña, que recoge lo que se guardó de noche.
 *
 * ⚠️ La clave se RESERVA antes de mandar (índice único de
 * `DailyNotificationLog`): el guardado y el cron pueden coincidir, y sin
 * reserva los dos felicitarían a la misma persona. Si el envío falla se suelta
 * para que el siguiente intento lo mande.
 */

const TIPO_LOG = "WA_RECO";

function grupoDe(storeId: string): string | null {
  const jid = process.env.WHATSAPP_ANNOUNCE_GROUP_JID ?? "";
  const tiendas = (process.env.WHATSAPP_ANNOUNCE_STORE_IDS ?? "").split(",").map((s) => s.trim());
  return jid && tiendas.includes(storeId) ? jid : null;
}

export function textoDe(r: Reconocimiento): string {
  const nombre = firstName(r.nombre);
  const enDonativos = r.donativos > 1 ? ` en ${r.donativos} donativos` : "";
  if (r.tipo === "primero") {
    return [
      "💙 *Tailored Help · ¡primer donativo!*",
      "",
      `¡Felicidades, ${nombre}! 🎉 Consiguió el primer donativo de la campaña en la tienda: *${pesos(r.monto)}* para la escuela Christel House México.`,
      "",
      "Así se arranca. En cada cobro invitemos al cliente a donar en caja: gerencia y asesores, todos sumamos. ¡Vamos por más! 🙌"
    ].join("\n");
  }
  if (r.tipo === "dia") {
    return [
      "💙 *Tailored Help · ¡gran día!*",
      "",
      `¡Bravo, ${nombre}! 🎉 El ${fechaLarga(r.fecha).toLowerCase()} juntó *${pesos(r.monto)}*${enDonativos} para Christel House México.`,
      "",
      "Gracias por invitar a cada cliente. ¿Quién es el siguiente en llegar a $150 en un día? 💪"
    ].join("\n");
  }
  return [
    `🏆 *Tailored Help · MVP de la semana ${reconstructRdvWeek(new Date(`${r.fecha}T00:00:00Z`)).weekNumber}*`,
    "",
    `¡${nombre} fue quien más donativos juntó la semana pasada: *${pesos(r.monto)}*${enDonativos}! 🎉`,
    "",
    "Gracias por ponerle tanto corazón. Arranca otra semana: ¿quién será el MVP? 🙌"
  ].join("\n");
}

async function reservar(storeId: string, clave: string): Promise<boolean> {
  try {
    await prisma.dailyNotificationLog.create({ data: { employeeId: storeId, date: clave, type: TIPO_LOG } });
    return true;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return false;
    throw error;
  }
}

export async function revisarReconocimientos(storeId: string): Promise<{ enviados: number; motivo?: string }> {
  if (!whatsappReemplazaPush()) return { enviados: 0, motivo: "apagado" };
  if (!enHorarioDeAvisos()) return { enviados: 0, motivo: "fuera-de-horario" };
  const grupo = grupoDe(storeId);
  if (!grupo) return { enviados: 0, motivo: "sin-grupo" };
  const campana = await campanaActual();
  if (!campana || !campana.active) return { enviados: 0, motivo: "sin-campana" };

  const [filas, logs, store] = await Promise.all([
    prisma.campaignEntry.findMany({
      where: { campaignId: campana.id, storeId },
      select: { userId: true, date: true, amount: true, count: true, createdAt: true, user: { select: { name: true } } }
    }),
    prisma.dailyNotificationLog.findMany({ where: { employeeId: storeId, type: TIPO_LOG, date: { startsWith: `${campana.slug}:` } }, select: { date: true } }),
    prisma.store.findUnique({ where: { id: storeId }, select: { name: true } })
  ]);
  const prefijo = `${campana.slug}:`;
  const ya = new Set(logs.map((l) => l.date.slice(prefijo.length)));
  const lista = pendientes({
    hoy: resolveMonterreyDate().dateKey,
    ya,
    aportes: filas.map((f) => ({ userId: f.userId, nombre: f.user.name, fecha: claveFecha(f.date), monto: Number(f.amount), donativos: f.count, creado: f.createdAt }))
  });

  let enviados = 0;
  for (const r of lista) {
    const clave = `${prefijo}${r.clave}`;
    if (!(await reservar(storeId, clave))) continue;
    const texto = textoDe(r);
    let ok = false;
    try {
      const png = await tarjetaReconocimiento({
        tipo: r.tipo,
        nombre: r.nombre,
        tienda: store?.name ?? "",
        monto: r.monto,
        donativos: r.donativos,
        cuando: r.tipo === "mvp" ? `Semana ${reconstructRdvWeek(new Date(`${r.fecha}T00:00:00Z`)).weekNumber}` : fechaLarga(r.fecha)
      });
      ok = await enviarMediaPorWhatsApp({ phone: grupo, mediaUrl: png.toString("base64"), caption: texto, mimetype: "image/png", fileName: `reconocimiento-${r.tipo}.png` });
    } catch (error) {
      console.error("[reconocimientos] tarjeta", error instanceof Error ? error.message : error);
    }
    if (!ok) ok = await enviarAvisoPorWhatsApp({ phone: grupo, text: texto });
    if (ok) {
      enviados += 1;
    } else {
      await prisma.dailyNotificationLog.deleteMany({ where: { employeeId: storeId, date: clave, type: TIPO_LOG } });
    }
  }
  return { enviados };
}
