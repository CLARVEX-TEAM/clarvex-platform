import { NextResponse } from "next/server";
import { z } from "zod";
import { isApiError, parseJson, requireSession } from "@/lib/api";
import { isValidKudoEmoji } from "@/lib/kudos";
import { createNotifications } from "@/lib/notifications";
import { dispatchPushToUsers } from "@/lib/push";
import { firstName } from "@/lib/daily-summary";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const session = await requireSession();
  if (isApiError(session)) return session;

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [kudos, weekKudos] = await Promise.all([
    prisma.kudo.findMany({
      where: { storeId: session.storeId },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { fromUser: { select: { name: true, photoUrl: true } }, toUser: { select: { name: true, photoUrl: true } } }
    }),
    prisma.kudo.findMany({
      where: { storeId: session.storeId, createdAt: { gte: weekAgo } },
      select: { toUserId: true, toUser: { select: { name: true, photoUrl: true } } }
    })
  ]);

  const counts = new Map<string, { name: string; photoUrl: string | null; count: number }>();
  for (const kudo of weekKudos) {
    const entry = counts.get(kudo.toUserId) ?? { name: kudo.toUser.name, photoUrl: kudo.toUser.photoUrl, count: 0 };
    entry.count += 1;
    counts.set(kudo.toUserId, entry);
  }
  const topWeek = Array.from(counts.values()).sort((a, b) => b.count - a.count)[0] ?? null;

  return NextResponse.json({
    kudos: kudos.map((kudo) => ({
      id: kudo.id,
      emoji: kudo.emoji,
      message: kudo.message,
      from: { name: kudo.fromUser.name, photoUrl: kudo.fromUser.photoUrl },
      to: { name: kudo.toUser.name, photoUrl: kudo.toUser.photoUrl },
      createdAt: kudo.createdAt.toISOString()
    })),
    topWeek
  });
}

const schema = z.object({
  toUserId: z.string().min(1),
  emoji: z.string().refine(isValidKudoEmoji, "Reconocimiento no válido."),
  message: z.string().trim().max(280).optional()
});

export async function POST(request: Request) {
  const session = await requireSession();
  if (isApiError(session)) return session;

  const parsed = await parseJson(request, schema);
  if ("response" in parsed) return parsed.response;
  const { toUserId, emoji, message } = parsed.data;

  if (toUserId === session.userId) {
    return NextResponse.json({ error: "No puedes reconocerte a ti mismo." }, { status: 400 });
  }
  const recipient = await prisma.user.findFirst({ where: { id: toUserId, storeId: session.storeId }, select: { id: true } });
  if (!recipient) return NextResponse.json({ error: "Integrante no encontrado." }, { status: 404 });

  const kudo = await prisma.$transaction(async (tx) => {
    const created = await tx.kudo.create({
      data: { storeId: session.storeId, fromUserId: session.userId, toUserId, emoji, message: message || null }
    });
    await createNotifications(tx, [{
      storeId: session.storeId,
      userId: toUserId,
      type: "KUDO",
      title: `${emoji} ¡Reconocimiento!`,
      body: `${firstName(session.name)} te reconoció ${emoji}${message ? `: ${message}` : ""}`
    }]);
    return created;
  });

  dispatchPushToUsers([toUserId], {
    title: `${emoji} ¡Reconocimiento!`,
    body: `${firstName(session.name)} te reconoció ${emoji}${message ? `: ${message}` : ""}`,
    tag: "kudo",
    url: "/kudos"
  }).catch(() => undefined);

  return NextResponse.json({ id: kudo.id }, { status: 201 });
}
