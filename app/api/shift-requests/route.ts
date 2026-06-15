import { NextResponse } from "next/server";
import { z } from "zod";
import { isApiError, parseJson, requireSession } from "@/lib/api";
import { createNotifications } from "@/lib/notifications";
import { dispatchPushToUsers } from "@/lib/push";
import { firstName } from "@/lib/daily-summary";
import { SHIFT_TYPE_LABELS, formatRequestDate } from "@/lib/shift-requests";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET() {
  const session = await requireSession();
  if (isApiError(session)) return session;
  const manager = session.role !== "ASESOR";

  const requests = await prisma.shiftRequest.findMany({
    where: { storeId: session.storeId, ...(manager ? {} : { requesterId: session.userId }) },
    orderBy: { createdAt: "desc" },
    include: { requester: { select: { name: true, photoUrl: true } } }
  });

  return NextResponse.json({
    requests: requests.map((request) => ({
      id: request.id,
      date: request.date,
      type: request.type,
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
  type: z.enum(["DIA_LIBRE", "CAMBIO_TURNO"]),
  reason: z.string().trim().max(280).optional()
});

export async function POST(request: Request) {
  const session = await requireSession();
  if (isApiError(session)) return session;

  const parsed = await parseJson(request, schema);
  if ("response" in parsed) return parsed.response;
  const { date, type, reason } = parsed.data;

  const created = await prisma.shiftRequest.create({
    data: { storeId: session.storeId, requesterId: session.userId, date, type, reason: reason || null }
  });

  const managers = await prisma.user.findMany({ where: { storeId: session.storeId, role: { in: ["GERENTE", "SUBGERENTE"] } }, select: { id: true } });
  const managerIds = managers.map((manager) => manager.id).filter((id) => id !== session.userId);
  if (managerIds.length > 0) {
    const title = "Nueva solicitud";
    const body = `${firstName(session.name)} solicita ${SHIFT_TYPE_LABELS[type]} para el ${formatRequestDate(date)}`;
    await createNotifications(prisma, managerIds.map((id) => ({ storeId: session.storeId, userId: id, type: "SHIFT_REQUEST" as const, title, body })));
    dispatchPushToUsers(managerIds, { title, body, tag: "solicitud" }).catch(() => undefined);
  }

  return NextResponse.json({ id: created.id }, { status: 201 });
}
