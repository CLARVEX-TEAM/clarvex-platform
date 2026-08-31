import { NextResponse } from "next/server";
import { requireSession, isApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Lo mínimo para que buscar signifique algo. Con una letra sale medio chat. */
const MINIMO = 2;
const TOPE = 40;

/**
 * GET /api/chat/search?q=texto[&roomId=...]
 *
 * Busca en las conversaciones **de las que eres miembro**. Sin `roomId` busca en
 * todas las tuyas.
 *
 * ⚠️ El alcance sale de `ChatMember`, no de un parámetro. Aceptar una sala por
 * la URL dejaría leer conversaciones ajenas —incluidos los directos de otros—
 * con solo cambiar un id.
 */
export async function GET(request: Request) {
  const session = await requireSession();
  if (isApiError(session)) return session;

  const params = new URL(request.url).searchParams;
  const q = (params.get("q") ?? "").trim();
  if (q.length < MINIMO) {
    return NextResponse.json({ ok: true, results: [], corto: true });
  }

  const mias = await prisma.chatMember.findMany({
    where: { userId: session.userId },
    select: { roomId: true }
  });
  let roomIds = mias.map((m) => m.roomId);

  const pedida = params.get("roomId");
  if (pedida) {
    // Si pide una sala concreta, tiene que ser una de las suyas.
    roomIds = roomIds.filter((id) => id === pedida);
    if (roomIds.length === 0) {
      return NextResponse.json({ error: "No tienes acceso a ese chat." }, { status: 403 });
    }
  }
  if (roomIds.length === 0) return NextResponse.json({ ok: true, results: [] });

  const encontrados = await prisma.chatMessage.findMany({
    where: {
      roomId: { in: roomIds },
      deletedAt: null,
      // Lo que ocultaste para ti no vuelve por la puerta de atrás.
      hiddenFor: { none: { userId: session.userId } },
      body: { contains: q, mode: "insensitive" },
      /*
       * ⚠️ Fuera las fotos, GIFs y stickers. Su cuerpo es `[img:/api/chat/file
       * ?k=stores%2F…]`, así que buscar «chat» o «store» devolvería todas las
       * imágenes del historial como si coincidieran.
       */
      NOT: [{ body: { startsWith: "[img:" } }, { body: { startsWith: "[gif:" } }, { body: { startsWith: "[sticker:" } }]
    },
    orderBy: { createdAt: "desc" },
    take: TOPE,
    select: {
      id: true,
      roomId: true,
      body: true,
      createdAt: true,
      sender: { select: { id: true, name: true, photoUrl: true } },
      room: { select: { type: true, name: true } }
    }
  });

  return NextResponse.json({
    ok: true,
    results: encontrados.map((m) => ({
      id: m.id,
      roomId: m.roomId,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
      senderId: m.sender.id,
      senderName: m.sender.name,
      senderPhoto: m.sender.photoUrl,
      roomLabel: m.room.type === "GROUP" ? (m.room.name ?? "Chat Todos") : m.sender.name
    }))
  });
}
