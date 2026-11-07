import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { PERSON_WHERE } from "@/lib/store-people";
import { dispatchPushToUsers } from "@/lib/push";
import { enviarAvisoPorWhatsApp } from "@/lib/whatsapp-aviso";
import { enviarMediaPorWhatsApp } from "@/lib/whatsapp-media";
import { telefonosDe, whatsappReemplazaPush } from "@/lib/whatsapp-canal";
import type { DiaHorario, DiaMeta, DiaVenta } from "@/lib/whatsapp-mensajes";

/**
 * Datos y envío de los dos avisos semanales: metas y cierre.
 *
 * ⚠️ **Solo existen con `WA_REEMPLAZA_PUSH=1`.** Son avisos NUEVOS: sin el
 * interruptor, desplegar no le mandaría nada a nadie que no lo esperara.
 */

const DIA_MS = 86_400_000;
const DESCANSOS = new Set(["OFF", "VACATION", "PAID_DAY", "TERMINATED"]);
const PAUSA_MS = 2000;
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function claveDia(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

/** Domingo de la semana retail que contiene `fecha` (las semanas van de domingo a sábado). */
export function domingoDe(fecha: Date): Date {
  return new Date(fecha.getTime() - fecha.getUTCDay() * DIA_MS);
}

export function diasDeLaSemana(inicio: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => new Date(inicio.getTime() + i * DIA_MS));
}

type Persona = { id: string; name: string; role: string };

async function personasDe(storeId: string): Promise<Persona[]> {
  return prisma.user.findMany({ where: { storeId, ...PERSON_WHERE }, select: { id: true, name: true, role: true } });
}

async function semanaDe(storeId: string, inicio: Date) {
  const fin = new Date(inicio.getTime() + 6 * DIA_MS);
  const [kpis, horarios] = await Promise.all([
    prisma.kpi.findMany({
      where: { storeId, date: { gte: inicio, lte: fin } },
      select: { userId: true, date: true, dailyGoal: true, dailySales: true, transactions: true, pieces: true }
    }),
    prisma.schedule.findMany({ where: { storeId, date: { gte: inicio, lte: fin } }, select: { userId: true, date: true, status: true } })
  ]);
  const kpi = new Map(kpis.map((k) => [`${k.userId}|${claveDia(k.date)}`, k]));
  const horario = new Map(horarios.map((h) => [`${h.userId}|${claveDia(h.date)}`, h.status as string]));
  // Un día está capturado cuando ALGUIEN de la tienda tiene operación: la meta
  // sola no cuenta, porque Cuota Justa la escribe por adelantado con venta en cero.
  const capturados = new Set(
    kpis.filter((k) => k.transactions > 0 || k.pieces > 0 || Number(k.dailySales) !== 0).map((k) => claveDia(k.date))
  );
  return { kpi, horario, capturados };
}

function descansa(status: string | undefined, meta: number): boolean {
  if (status) return DESCANSOS.has(status);
  return meta <= 0;
}

// ── Metas ───────────────────────────────────────────────────────────────────

export type MetasDePersona = { persona: Persona; dias: DiaMeta[]; huella: string };

export async function metasDeLaSemana(storeId: string, inicio: Date): Promise<MetasDePersona[]> {
  const [personas, semana] = await Promise.all([personasDe(storeId), semanaDe(storeId, inicio)]);
  const fechas = diasDeLaSemana(inicio);
  return personas
    .map((persona) => {
      const dias = fechas.map((fecha): DiaMeta => {
        const k = semana.kpi.get(`${persona.id}|${claveDia(fecha)}`);
        const meta = k ? Number(k.dailyGoal) : 0;
        return { fecha, meta, descansa: descansa(semana.horario.get(`${persona.id}|${claveDia(fecha)}`), meta) };
      });
      const huella = createHash("sha1")
        .update(JSON.stringify(dias.map((d) => [Math.round(d.meta * 100), d.descansa])))
        .digest("hex")
        .slice(0, 12);
      return { persona, dias, huella };
    })
    .filter((m) => m.dias.some((d) => !d.descansa && d.meta > 0));
}

// ── Cierre ──────────────────────────────────────────────────────────────────

export type CierreDePersona = { persona: Persona; dias: DiaVenta[]; ventaAnterior: number | null };

export async function cierreDeLaSemana(storeId: string, inicio: Date): Promise<{ personas: CierreDePersona[]; sabadoCapturado: boolean }> {
  const anterior = new Date(inicio.getTime() - 7 * DIA_MS);
  const [personas, semana, previas] = await Promise.all([
    personasDe(storeId),
    semanaDe(storeId, inicio),
    prisma.kpi.groupBy({
      by: ["userId"],
      where: { storeId, date: { gte: anterior, lt: inicio } },
      _sum: { dailySales: true }
    })
  ]);
  const ventaPrevia = new Map(previas.map((p) => [p.userId, Number(p._sum.dailySales ?? 0)]));
  const fechas = diasDeLaSemana(inicio);
  const resultado = personas
    .map((persona) => {
      const dias = fechas.map((fecha): DiaVenta => {
        const clave = claveDia(fecha);
        const k = semana.kpi.get(`${persona.id}|${clave}`);
        const meta = k ? Number(k.dailyGoal) : 0;
        return {
          fecha,
          meta,
          venta: k ? Number(k.dailySales) : 0,
          descansa: descansa(semana.horario.get(`${persona.id}|${clave}`), meta),
          capturado: semana.capturados.has(clave)
        };
      });
      return { persona, dias, ventaAnterior: ventaPrevia.get(persona.id) ?? null };
    })
    .filter((c) => c.dias.some((d) => !d.descansa && (d.meta > 0 || d.venta !== 0)));
  return { personas: resultado, sabadoCapturado: semana.capturados.has(claveDia(fechas[6])) };
}

// ── Horarios ────────────────────────────────────────────────────────────────

export type HorariosDePersona = { persona: Persona; dias: DiaHorario[]; huella: string };

/**
 * Horarios de una semana y cuándo se tocaron por última vez. Solo entra quien
 * tiene al menos un día capturado; un día sin fila sale «Por definir».
 */
export async function horariosDeLaSemana(storeId: string, inicio: Date): Promise<{ personas: HorariosDePersona[]; ultimoCambio: Date | null }> {
  const fin = new Date(inicio.getTime() + 6 * DIA_MS);
  const [personas, filas] = await Promise.all([
    personasDe(storeId),
    prisma.schedule.findMany({
      where: { storeId, date: { gte: inicio, lte: fin } },
      select: { userId: true, date: true, status: true, startTime: true, endTime: true, updatedAt: true }
    })
  ]);
  const ultimoCambio = filas.reduce<Date | null>((max, f) => (!max || f.updatedAt > max ? f.updatedAt : max), null);
  const porClave = new Map(filas.map((f) => [`${f.userId}|${claveDia(f.date)}`, f]));
  const fechas = diasDeLaSemana(inicio);
  const resultado = personas
    .map((persona) => {
      const dias = fechas.map((fecha): DiaHorario => {
        const f = porClave.get(`${persona.id}|${claveDia(fecha)}`);
        return f
          ? { fecha, status: f.status as string, inicio: f.startTime, fin: f.endTime }
          : { fecha, status: "SIN_CAPTURA", inicio: null, fin: null };
      });
      const huella = createHash("sha1")
        .update(JSON.stringify(dias.map((d) => [d.status, d.inicio, d.fin])))
        .digest("hex")
        .slice(0, 12);
      return { persona, dias, huella };
    })
    // Quien no tiene nada esa semana (baja reciente, alta pendiente) no recibe una semana vacía.
    .filter((h) => h.dias.some((d) => d.status !== "SIN_CAPTURA" && d.status !== "TERMINATED"));
  return { personas: resultado, ultimoCambio };
}

// ── Envío ───────────────────────────────────────────────────────────────────

/**
 * Manda tarjeta + texto a quien tiene WhatsApp; si la imagen falla, el texto
 * solo; si tampoco, la notificación. Devuelve por dónde salió.
 *
 * El texto va como pie de la imagen: así queda todo en un solo mensaje que se
 * puede buscar en el historial.
 */
export async function enviarSemanal(opciones: {
  userId: string;
  /** Pie de la tarjeta: el desglose ya va en la imagen. */
  texto: string;
  /** Si la imagen no sale, este texto lleva la tabla completa. */
  textoSinTarjeta: string;
  tarjeta: () => Promise<Buffer>;
  nombreArchivo: string;
  push: { title: string; body: string; tag: string; url: string };
  telefonos: Map<string, string>;
}): Promise<"tarjeta" | "texto" | "push"> {
  const telefono = opciones.telefonos.get(opciones.userId);
  if (telefono) {
    let png: Buffer | null = null;
    try {
      png = await opciones.tarjeta();
    } catch (error) {
      console.error("[whatsapp-semanal] no se pudo dibujar la tarjeta", error instanceof Error ? error.message : error);
    }
    if (png) {
      const ok = await enviarMediaPorWhatsApp({
        phone: telefono,
        mediaUrl: png.toString("base64"),
        caption: opciones.texto,
        mimetype: "image/png",
        fileName: opciones.nombreArchivo
      });
      if (ok) return "tarjeta";
    }
    if (await enviarAvisoPorWhatsApp({ phone: telefono, text: opciones.textoSinTarjeta })) return "texto";
  }
  await dispatchPushToUsers([opciones.userId], opciones.push);
  return "push";
}

export { telefonosDe, whatsappReemplazaPush, esperar, PAUSA_MS };
