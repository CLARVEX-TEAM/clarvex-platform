import { NextResponse } from "next/server";
import { requireCron } from "@/lib/cron-auth";
import { prisma } from "@/lib/prisma";
import { todayInMonterrey } from "@/lib/mexico-timezone";
import { enviarAvisoPorWhatsApp } from "@/lib/whatsapp-aviso";
import { recordatorioSegunEstado } from "@/lib/bot-pendientes-texto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Recordatorios privados por WhatsApp (workflow n8n «KIMI …»).
 *
 * Query param: ?type=announcement|task|course
 * - announcement: comunicados sin leer → avisa 3pm/6pm solo si trabajó hoy (si
 *   descansó, recorre el plazo al siguiente día laboral). Avisos 3 y 4 al bot
 *   de las 8:00.
 * - task: pendientes que vencen hoy (cortas) → 3pm y 6pm, solo si trabajó hoy.
 * - course: pendientes largos/cursos → Lun-Mié-Vie 10am; carga del dueDate en
 *   fin de semana; si el empleado descansa ese día no se le molesta.
 *
 * Protegido con CRON_SECRET (Bearer). El workflow n8n corre en el mismo host.
 */

type ReminderType = "announcement" | "task" | "course";

const STORE_ID = "clarvex-demo-store";
const TIME_ZONE = "America/Monterrey";

function dayKey(date: Date): string {
  const partes = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, weekday: "short" }).formatToParts(date);
  const weekday = partes.find((p) => p.type === "weekday")?.value ?? "";
  const mapa: Record<string, string> = {
    Sun: "Dom", Mon: "Lun", Tue: "Mar", Wed: "Mie", Thu: "Jue", Fri: "Vie", Sat: "Sab"
  };
  return mapa[weekday] ?? "Lun";
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
/** «23 nov», en la zona de la tienda. */
function fechaCorta(date: Date): string {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, day: "numeric", month: "numeric" }).formatToParts(date);
  const dia = p.find((x) => x.type === "day")?.value ?? "";
  const mes = Number(p.find((x) => x.type === "month")?.value ?? 1);
  return `${dia} ${MESES[mes - 1]}`;
}

function addDays(base: Date, days: number): Date {
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
}

/** La fecha `due` cae en fin de semana (sáb o dom) en la zona de la tienda. */
function isWeekendDue(due: Date): boolean {
  const clave = dayKey(due);
  return clave === "Sab" || clave === "Dom";
}

type Empleado = { userId: string; name: string; phone: string };

/** Empleados con teléfono que trabajan HOY (sin schedule OFF/VACATION/PAID_DAY en la
 *  fecha `today`). ⚠️ Se filtra SOLO por `date`, nunca por el día de la semana: la tabla
 *  guarda semanas viejas con el mismo `day` (un OFF de otra semana excluía a Jazmín). */
async function empleadosQueTrabajan(today: Date, userIds: string[]): Promise<Empleado[]> {
  if (userIds.length === 0) return [];
  return prisma.$queryRaw<Empleado[]>`
    SELECT u.id AS "userId", u.name, p.phone
    FROM "User" u
    JOIN "UserPhone" p ON p."userId" = u.id
    WHERE u."storeId" = ${STORE_ID}
      AND u."active" = TRUE
      AND u.id = ANY(${userIds})
      AND NOT EXISTS (
        SELECT 1 FROM "Schedule" s
        WHERE s."storeId" = ${STORE_ID} AND s."userId" = u.id
          AND s.date = ${today}
          AND s.status IN ('OFF','VACATION','PAID_DAY')
      )
  `;
}

async function avisar(empleados: Empleado[], texto: (e: Empleado) => string): Promise<number> {
  let enviados = 0;
  for (const e of empleados) {
    await enviarAvisoPorWhatsApp({ phone: e.phone, text: texto(e) });
    enviados += 1;
  }
  return enviados;
}

async function recordarComunicados(): Promise<number> {
  const hoy = todayInMonterrey();
  const desde = addDays(hoy, -7);
  const anuncios = await prisma.announcement.findMany({
    where: { storeId: STORE_ID, createdAt: { gte: desde } },
    select: { id: true, title: true },
    orderBy: { createdAt: "desc" }
  });
  if (anuncios.length === 0) return 0;

  const todos = await prisma.user.findMany({
    where: { storeId: STORE_ID, active: true, role: { not: "REGIONAL" } },
    select: { id: true }
  });
  const userIds = todos.map((u) => u.id);
  const leidos = await prisma.announcementRead.findMany({
    where: { announcementId: { in: anuncios.map((a) => a.id) }, userId: { in: userIds } },
    select: { announcementId: true, userId: true }
  });
  const leidoSet = new Set(leidos.map((l) => `${l.announcementId}:${l.userId}`));

  let enviados = 0;
  for (const anuncio of anuncios) {
    // Quien hoy descansa no recibe nada: sigue sin leer, así que el aviso le
    // llega el día que regrese (el recordatorio corre 2 veces al día).
    const sinLeer = userIds.filter((uid) => !leidoSet.has(`${anuncio.id}:${uid}`));
    if (sinLeer.length === 0) continue;
    const empleados = await empleadosQueTrabajan(hoy, sinLeer);
    enviados += await avisar(empleados, (e) => {
      const nombre = e.name.split(" ")[0];
      return `📢 ${nombre}, no has leído el comunicado «${anuncio.title}». Confírmalo en la app cuando puedas.`;
    });
  }
  return enviados;
}

async function recordarTareas(): Promise<number> {
  const hoy = todayInMonterrey();
  const manana = addDays(hoy, 1);
  const pendientes = await prisma.pending.findMany({
    where: {
      storeId: STORE_ID,
      status: { not: "COMPLETADO" },
      dueDate: { gte: hoy, lt: manana }
    },
    select: { id: true, title: true, ownerId: true, status: true, cierreSolicitadoAt: true }
  });
  if (pendientes.length === 0) return 0;

  const ownerIds = [...new Set(pendientes.map((p) => p.ownerId))];
  const trabajaronHoy = await empleadosQueTrabajan(hoy, ownerIds);
  const porDueno = new Map<string, typeof pendientes>();
  for (const p of pendientes) {
    const lista = porDueno.get(p.ownerId) ?? [];
    lista.push(p);
    porDueno.set(p.ownerId, lista);
  }
  let enviados = 0;
  for (const e of trabajaronHoy) {
    const tareas = porDueno.get(e.userId) ?? [];
    if (tareas.length === 0) continue;
    // El mensaje cambia con el estatus; quien ya pidió cierre no recibe nada.
    const textos = tareas
      .map((t) => recordatorioSegunEstado({ nombre: e.name, titulo: t.title, estado: t.status, cierrePedido: Boolean(t.cierreSolicitadoAt), vence: "hoy" }))
      .filter((t): t is string => Boolean(t));
    if (textos.length === 0) continue;
    enviados += await avisar([e], () => textos.join("\n\n"));
  }
  return enviados;
}

async function recordarCursos(): Promise<number> {
  // Tareas largas/cursos: vencen en más de 7 días (carga en fin de semana).
  const hoy = todayInMonterrey();
  const en7 = addDays(hoy, 7);
  const pendientes = await prisma.pending.findMany({
    where: {
      storeId: STORE_ID,
      status: { not: "COMPLETADO" },
      dueDate: { gte: en7 }
    },
    select: { id: true, title: true, ownerId: true, dueDate: true, status: true, cierreSolicitadoAt: true }
  });
  if (pendientes.length === 0) return 0;

  const ownerIds = [...new Set(pendientes.map((p) => p.ownerId))];
  const trabajaronHoy = await empleadosQueTrabajan(hoy, ownerIds);
  const porDueno = new Map<string, typeof pendientes>();
  for (const p of pendientes) {
    const lista = porDueno.get(p.ownerId) ?? [];
    lista.push(p);
    porDueno.set(p.ownerId, lista);
  }
  let enviados = 0;
  for (const e of trabajaronHoy) {
    const tareas = porDueno.get(e.userId) ?? [];
    if (tareas.length === 0) continue;
    // PENDIENTE: «no registras avance». EN PROCESO: «¿cómo vas? si terminaste,
    // certificado y *terminé*». Quien ya pidió cierre espera a gerencia: nada.
    const textos = tareas
      .map((t) =>
        recordatorioSegunEstado({
          nombre: e.name,
          titulo: t.title,
          estado: t.status,
          cierrePedido: Boolean(t.cierreSolicitadoAt),
          vence: `el ${fechaCorta(t.dueDate)}${isWeekendDue(t.dueDate) ? ", fin de semana" : ""}`
        })
      )
      .filter((t): t is string => Boolean(t));
    if (textos.length === 0) continue;
    enviados += await avisar([e], () => textos.join("\n\n"));
  }
  return enviados;
}

export async function POST(request: Request) {
  const unauthorized = requireCron(request);
  if (unauthorized) return unauthorized;

  // El tipo viene como query param ?type=announcement|task|course
  // (más confiable que body JSON con el middleware de Next.js)
  const url = new URL(request.url);
  const type = url.searchParams.get("type") as ReminderType | null;
  if (type !== "announcement" && type !== "task" && type !== "course") {
    return NextResponse.json(
      { ok: false, error: "type debe ser announcement, task o course (query param)." },
      { status: 400 }
    );
  }

  const now = new Date();
  let sent = 0;
  try {
    if (type === "announcement") sent = await recordarComunicados();
    else if (type === "task") sent = await recordarTareas();
    else sent = await recordarCursos();
  } catch (error) {
    console.error("[kimi/reminder-check] fallo:", error);
    return NextResponse.json({ ok: false, error: "fallo interno" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, type, sent, at: now.toISOString() });
}
