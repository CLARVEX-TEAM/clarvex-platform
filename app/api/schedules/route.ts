import { NextRequest, NextResponse } from "next/server";
import { isApiError, requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { signR2Url } from "@/lib/r2";
import { buildWeeklySchedule, companerosDeTurno } from "@/lib/schedule-report";
import { dateKey, endOfWeek, parseWeekStart } from "@/lib/schedule-week";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await requireSession();
  if (isApiError(session)) return session;

  const weekStart = parseWeekStart(request.nextUrl.searchParams.get("weekStart"));
  if (!weekStart) return NextResponse.json({ error: "weekStart debe ser un domingo en formato YYYY-MM-DD." }, { status: 400 });

  const manager = session.role === "GERENTE" || session.role === "SUBGERENTE";
  const requestedUserId = request.nextUrl.searchParams.get("userId");
  const userId = manager ? requestedUserId || undefined : session.userId;

  /*
   * ⚠️ «Con quién me toca» — ver la cabecera de este cambio.
   *
   * Solo se arma cuando la pantalla de Horarios lo pide, y aun así lleva el
   * mínimo: quién entra y a qué hora. El filtro `userId` de arriba NO se toca,
   * así que `schedules` sigue devolviendo exactamente lo de siempre.
   */
  const quiereCompaneros = request.nextUrl.searchParams.get("companeros") === "1";

  if (userId) {
    const user = await prisma.user.findFirst({ where: { id: userId, storeId: session.storeId }, select: { id: true } });
    if (!user) return NextResponse.json({ error: "Usuario no disponible en esta tienda." }, { status: 404 });
  }

  const [tienda, users, schedules, availableWeeks] = await Promise.all([
    prisma.store.findUnique({ where: { id: session.storeId }, select: { name: true, address: true, mapaUrl: true } }),
    prisma.user.findMany({
      // Sin el usuario "kiosko" (checklistOnly): es el celular del cierre, no un
      // integrante con turno. Salía como "Sin horario" en toda la semana.
      where: { storeId: session.storeId, active: true, checklistOnly: false, ...(userId ? { id: userId } : {}) },
      select: { id: true, name: true, role: true, photoUrl: true },
      orderBy: [{ role: "asc" }, { name: "asc" }]
    }),
    prisma.schedule.findMany({
      where: {
        storeId: session.storeId,
        ...(userId ? { userId } : {}),
        date: { gte: weekStart, lte: endOfWeek(weekStart) }
      },
      orderBy: [{ date: "asc" }, { userId: "asc" }]
    }),
    prisma.schedule.findMany({
      where: { storeId: session.storeId, ...(userId ? { userId } : {}) },
      distinct: ["weekStart"],
      select: { weekStart: true },
      orderBy: { weekStart: "desc" }
    })
  ]);
  const weekEnd = endOfWeek(weekStart);
  const weeklySchedule = buildWeeklySchedule(users, schedules, weekStart);

  /*
   * Quién más entra cada día de la semana.
   *
   * ⚠️ Se consulta APARTE y no reutiliza `schedules`: esa consulta ya viene
   * filtrada por `userId` cuando la vista es personal, que es justo el caso en
   * el que hacen falta los demás. Reutilizarla habría obligado a quitar el
   * filtro, y con él se habría abierto el payload entero.
   */
  let companeros: Array<{ date: string; userId: string; userName: string; photoUrl: string | null; startTime: string | null; endTime: string | null }> = [];
  if (quiereCompaneros) {
    const delDia = await prisma.schedule.findMany({
      where: {
        storeId: session.storeId,
        status: "WORKING",
        date: { gte: weekStart, lte: weekEnd },
        user: { active: true, checklistOnly: false }
      },
      select: {
        date: true,
        status: true,
        startTime: true,
        endTime: true,
        user: { select: { id: true, name: true, photoUrl: true } }
      },
      orderBy: [{ date: "asc" }, { startTime: "asc" }]
    });
    // La decisión vive en `companerosDeTurno`, fuera de aquí, para poder
    // probarla: es una frontera de roles y no puede quedar sin guarda.
    companeros = companerosDeTurno(
      delDia.map((item) => ({
        date: dateKey(item.date),
        status: item.status,
        startTime: item.startTime,
        endTime: item.endTime,
        user: item.user
      })),
      session.userId
    );
  }

  return NextResponse.json({
    weekStart: dateKey(weekStart),
    weekEnd: dateKey(weekEnd),
    availableWeeks: availableWeeks.map((item) => dateKey(item.weekStart)),
    schedules: weeklySchedule,
    companeros,
    /*
     * Dónde está la tienda.
     *
     * ⚠️ El mapa va FIRMADO, como todo lo que sale de R2: el bucket es privado
     * y la URL a secas devuelve un 403 que en pantalla parece una imagen rota.
     */
    tienda: {
      nombre: tienda?.name ?? null,
      direccion: tienda?.address ?? null,
      mapaUrl: await signR2Url(tienda?.mapaUrl ?? null)
    }
  }, { headers: { "Cache-Control": "private, no-store" } });
}
