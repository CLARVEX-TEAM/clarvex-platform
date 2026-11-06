import { NextResponse } from "next/server";
import { requireCron } from "@/lib/cron-auth";
import { prisma } from "@/lib/prisma";
import { todayInMonterrey } from "@/lib/mexico-timezone";
import { enviarAvisoPorWhatsApp } from "@/lib/whatsapp-aviso";

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
 *  fecha `today`). Se filtra por `date`, no por el día de la semana: la tabla puede
 *  tener semanas viejas con el mismo `day` (un OFF de otra semana excluía a Jazmín). */
async function empleadosQueTrabajan(day: string, today: Date, userIds: string[]): Promise<Empleado[]> {
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
        WHERE s."storeId" = ${STORE_ID} AND s."userId" = u.id AND s.day = ${day}
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

async function recordarComunicados(now: Date): Promise<number> {
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

  // Horario de cada usuario por día, para recorrer el plazo si hoy descansa.
  const horarios = await prisma.schedule.findMany({
    where: { storeId: STORE_ID, userId: { in: userIds } },
    select: { userId: true, day: true, status: true }
  });
  const porDia = new Map<string, Map<string, string | null>>(); // userId -> day -> status
  for (const h of horarios) {
    const m = porDia.get(h.userId) ?? new Map<string, string | null>();
    m.set(h.day, h.status ?? null);
    porDia.set(h.userId, m);
  }
  const trabajaEl = (userId: string, day: string): boolean => {
    const status = porDia.get(userId)?.get(day);
    return status !== "OFF" && status !== "VACATION" && status !== "PAID_DAY";
  };

  const hoyClave = dayKey(now);
  let enviados = 0;
  for (const anuncio of anuncios) {
    // Para cada usuario sin leer: si hoy trabajó, su plazo es hoy. Si hoy
    // descansa, su plazo cae en su próximo día laboral y solo se le avisa
    // cuando llegue ese día (el recordatorio corre 2 veces al día).
    const sinLeer = userIds.filter((uid) => !leidoSet.has(`${anuncio.id}:${uid}`));
    if (sinLeer.length === 0) continue;
    const destinatarios = sinLeer.filter((uid) => trabajaEl(uid, hoyClave));
    const empleados = await empleadosQueTrabajan(hoyClave, hoy, destinatarios);
    enviados += await avisar(empleados, (e) => {
      const nombre = e.name.split(" ")[0];
      return `📢 ${nombre}, no has leído el comunicado «${anuncio.title}». Confírmalo en la app cuando puedas.`;
    });
  }
  return enviados;
}

async function recordarTareas(now: Date): Promise<number> {
  const hoy = todayInMonterrey();
  const manana = addDays(hoy, 1);
  const pendientes = await prisma.pending.findMany({
    where: {
      storeId: STORE_ID,
      status: { not: "COMPLETADO" },
      dueDate: { gte: hoy, lt: manana }
    },
    select: { id: true, title: true, ownerId: true }
  });
  if (pendientes.length === 0) return 0;

  const ownerIds = [...new Set(pendientes.map((p) => p.ownerId))];
  const hoyClave = dayKey(now);
  const trabajaronHoy = await empleadosQueTrabajan(hoyClave, hoy, ownerIds);
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
    const nombre = e.name.split(" ")[0];
    const lista = tareas.map((t) => `• ${t.title}`).join("\n");
    enviados += await avisar([e], () => `⏰ ${nombre}, tienes pendientes que vencen hoy:\n${lista}\nActualízalos en la app.`);
  }
  return enviados;
}

async function recordarCursos(now: Date): Promise<number> {
  // Tareas largas/cursos: vencen en más de 7 días (carga en fin de semana).
  const hoy = todayInMonterrey();
  const en7 = addDays(hoy, 7);
  const pendientes = await prisma.pending.findMany({
    where: {
      storeId: STORE_ID,
      status: { not: "COMPLETADO" },
      dueDate: { gte: en7 }
    },
    select: { id: true, title: true, ownerId: true, dueDate: true }
  });
  if (pendientes.length === 0) return 0;

  const ownerIds = [...new Set(pendientes.map((p) => p.ownerId))];
  const hoyClave = dayKey(now);
  const trabajaronHoy = await empleadosQueTrabajan(hoyClave, hoy, ownerIds);
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
    const nombre = e.name.split(" ")[0];
    const lista = tareas.map((t) => {
      const finde = isWeekendDue(t.dueDate) ? " (fin de semana)" : "";
      return `• ${t.title}${finde}`;
    }).join("\n");
    enviados += await avisar([e], () => `📚 ${nombre}, recuerda tus cursos/capacitaciones:\n${lista}\nAvísanos cómo vas.`);
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
    if (type === "announcement") sent = await recordarComunicados(now);
    else if (type === "task") sent = await recordarTareas(now);
    else sent = await recordarCursos(now);
  } catch (error) {
    console.error("[kimi/reminder-check] fallo:", error);
    return NextResponse.json({ ok: false, error: "fallo interno" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, type, sent, at: now.toISOString() });
}
