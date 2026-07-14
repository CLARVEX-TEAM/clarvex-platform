import { NextResponse } from "next/server";
import { z } from "zod";
import { isApiError, parseJson, requireSession } from "@/lib/api";
import { createNotifications } from "@/lib/notifications";
import { dispatchPushToUsers } from "@/lib/push";
import { firstName } from "@/lib/daily-summary";
import { DAY_BALANCE_LABELS, SHIFT_TYPE_LABELS, dayBalanceField, formatRequestDate, isHourType } from "@/lib/shift-requests";
import { hoursBalanceFor } from "@/lib/hours-account";
import { vacationDaysAvailable } from "@/lib/vacation-account";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET() {
  const session = await requireSession();
  if (isApiError(session)) return session;
  const manager = session.role !== "ASESOR";

  const [requests, me, balance, vacation] = await Promise.all([
    prisma.shiftRequest.findMany({
      where: { storeId: session.storeId, ...(manager ? {} : { requesterId: session.userId }) },
      orderBy: { createdAt: "desc" },
      include: { requester: { select: { name: true, photoUrl: true } } }
    }),
    prisma.user.findUnique({ where: { id: session.userId }, select: { paidDays: true } }),
    // Saldo REAL: el inicial (del Excel) MÁS lo que la app acumuló sola. Leerlo
    // solo de hoursOwed dejaría atrapadas las horas ganadas automáticamente.
    hoursBalanceFor(session.userId),
    // Lo mismo con las vacaciones: el saldo capturado más lo ganado en cada
    // aniversario, menos lo que ya se tomó en Horarios.
    vacationDaysAvailable(session.userId)
  ]);

  return NextResponse.json({
    balance,
    vacationDays: vacation,
    paidDays: me?.paidDays ?? 0,
    requests: requests.map((request) => ({
      id: request.id,
      date: request.date,
      type: request.type,
      hours: request.hours,
      reason: request.reason,
      status: request.status,
      managerNote: request.managerNote,
      resolvedAt: request.resolvedAt?.toISOString() ?? null,
      createdAt: request.createdAt.toISOString(),
      requester: { name: request.requester.name, photoUrl: request.requester.photoUrl }
    }))
  });
}

const schema = z.object({
  date: z.string().regex(DATE_RE),
  type: z.enum(["VACACIONES", "DESCANSO", "PAGO_DIA", "SALIR_TEMPRANO", "ENTRAR_TARDE"]),
  reason: z.string().trim().max(280).optional(),
  hours: z.number().positive().max(24).optional()
}).refine((data) => !isHourType(data.type) || (data.hours !== undefined && data.hours > 0), { message: "Indica las horas." });

export async function POST(request: Request) {
  const session = await requireSession();
  if (isApiError(session)) return session;

  const parsed = await parseJson(request, schema);
  if ("response" in parsed) return parsed.response;
  const { date, type, reason } = parsed.data;
  const hours = isHourType(type) ? parsed.data.hours ?? null : null;

  // No se pueden solicitar más horas de las que se tienen de saldo.
  if (hours) {
    const balance = await hoursBalanceFor(session.userId);
    if (hours > balance) {
      return NextResponse.json({ error: `No tienes saldo suficiente. Disponible: ${balance} h.` }, { status: 400 });
    }
  }

  // Vacaciones / pago de día consumen 1 día del saldo correspondiente.
  const dayField = dayBalanceField(type);
  if (dayField) {
    // Las vacaciones se validan contra el saldo REAL (capturado + ganado − tomado);
    // el pago de día sigue siendo un número a mano, que nada calcula solo.
    const balance = dayField === "vacationDays"
      ? await vacationDaysAvailable(session.userId)
      : (await prisma.user.findUnique({ where: { id: session.userId }, select: { paidDays: true } }))?.paidDays ?? 0;
    if (balance < 1) {
      return NextResponse.json({ error: `No tienes saldo de ${DAY_BALANCE_LABELS[dayField]} disponible (saldo: ${balance}).` }, { status: 400 });
    }
  }

  const created = await prisma.shiftRequest.create({
    data: { storeId: session.storeId, requesterId: session.userId, date, type, hours, reason: reason || null }
  });

  const managers = await prisma.user.findMany({ where: { storeId: session.storeId, role: { in: ["GERENTE", "SUBGERENTE"] } }, select: { id: true } });
  const managerIds = managers.map((manager) => manager.id).filter((id) => id !== session.userId);
  if (managerIds.length > 0) {
    const title = "Nueva solicitud";
    const detail = hours ? ` (${hours} h)` : "";
    const body = `${firstName(session.name)} solicita ${SHIFT_TYPE_LABELS[type]}${detail} para el ${formatRequestDate(date)}`;
    await createNotifications(prisma, managerIds.map((id) => ({ storeId: session.storeId, userId: id, type: "SHIFT_REQUEST" as const, title, body })));
    dispatchPushToUsers(managerIds, { title, body, tag: "solicitud", url: "/solicitudes" }).catch(() => undefined);
  }

  return NextResponse.json({ id: created.id }, { status: 201 });
}
