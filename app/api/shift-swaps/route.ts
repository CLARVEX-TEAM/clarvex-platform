import { NextResponse } from "next/server";
import { z } from "zod";
import { isApiError, parseJson, requireSession } from "@/lib/api";
import { resolveMonterreyDate } from "@/lib/cron-time";
import { createNotifications } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { dispatchPushToUsers } from "@/lib/push";
import { validateProposal } from "@/lib/shift-swap";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function serialize(swap: {
  id: string; requesterId: string; requesterDate: string; targetId: string; targetDate: string;
  reason: string | null; status: string; driveUpdated: boolean; managerNote: string | null; createdAt: Date;
  requester: { name: string; photoUrl: string | null };
  target: { name: string; photoUrl: string | null };
}) {
  return {
    id: swap.id,
    requesterId: swap.requesterId,
    requesterName: swap.requester.name,
    requesterPhoto: swap.requester.photoUrl,
    requesterDate: swap.requesterDate,
    targetId: swap.targetId,
    targetName: swap.target.name,
    targetPhoto: swap.target.photoUrl,
    targetDate: swap.targetDate,
    reason: swap.reason,
    status: swap.status,
    driveUpdated: swap.driveUpdated,
    managerNote: swap.managerNote,
    createdAt: swap.createdAt.toISOString()
  };
}

/** Gerencia ve todos; un asesor ve los suyos (los que propuso y los que recibió). */
export async function GET() {
  const session = await requireSession();
  if (isApiError(session)) return session;
  const manager = session.role === "GERENTE" || session.role === "SUBGERENTE";

  const swaps = await prisma.shiftSwap.findMany({
    where: {
      storeId: session.storeId,
      ...(manager ? {} : { OR: [{ requesterId: session.userId }, { targetId: session.userId }] })
    },
    include: {
      requester: { select: { name: true, photoUrl: true } },
      target: { select: { name: true, photoUrl: true } }
    },
    orderBy: { createdAt: "desc" },
    take: 50
  });

  return NextResponse.json(
    { canApprove: manager, swaps: swaps.map(serialize) },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

const createSchema = z.object({
  targetId: z.string().min(1),
  requesterDate: z.string().regex(DATE_RE),
  targetDate: z.string().regex(DATE_RE),
  reason: z.string().trim().max(300).optional()
});

/** POST — un asesor propone el intercambio a un compañero. */
export async function POST(request: Request) {
  const session = await requireSession();
  if (isApiError(session)) return session;

  const parsed = await parseJson(request, createSchema);
  if ("response" in parsed) return parsed.response;
  const { targetId, requesterDate, targetDate, reason } = parsed.data;

  const target = await prisma.user.findFirst({
    where: { id: targetId, storeId: session.storeId, active: true },
    select: { id: true, name: true }
  });
  if (!target) return NextResponse.json({ error: "Compañero no encontrado." }, { status: 404 });

  // Se valida contra el HORARIO real: nadie puede ofrecer un descanso que no
  // tiene, ni pedir uno que el otro no tiene. Sin esto, gerencia se enteraría
  // hasta el final.
  const dates = [new Date(`${requesterDate}T00:00:00.000Z`), new Date(`${targetDate}T00:00:00.000Z`)];
  const schedules = await prisma.schedule.findMany({
    where: { storeId: session.storeId, userId: { in: [session.userId, targetId] }, date: { in: dates } },
    select: { userId: true, date: true, status: true }
  });
  const byKey = new Map(schedules.map((row) => [`${row.userId}:${row.date.toISOString().slice(0, 10)}`, row.status]));
  const scheduleOf = (userId: string, date: string) => byKey.get(`${userId}:${date}`) ?? null;

  const error = validateProposal(
    { requesterId: session.userId, requesterDate, targetId, targetDate },
    scheduleOf,
    resolveMonterreyDate().dateKey
  );
  if (error) return NextResponse.json({ error }, { status: 400 });

  const swap = await prisma.shiftSwap.create({
    data: {
      storeId: session.storeId,
      requesterId: session.userId,
      requesterDate,
      targetId,
      targetDate,
      reason: reason || null
    },
    include: {
      requester: { select: { name: true, photoUrl: true } },
      target: { select: { name: true, photoUrl: true } }
    }
  });

  await createNotifications(prisma, [{
    storeId: session.storeId,
    userId: targetId,
    type: "SHIFT_REQUEST" as const,
    title: "Cambio de descanso",
    body: `${session.name} te propone cambiar su descanso del ${requesterDate} por el tuyo del ${targetDate}.`
  }]);
  dispatchPushToUsers([targetId], {
    title: "🔄 Te proponen un cambio",
    body: `${session.name} quiere cambiar su descanso del ${requesterDate} por el tuyo del ${targetDate}.`,
    tag: "cambio-turno",
    url: "/solicitudes"
  }).catch(() => undefined);

  return NextResponse.json({ swap: serialize(swap) }, { status: 201 });
}
