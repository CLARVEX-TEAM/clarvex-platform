import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { isOnline, touchPresence } from "@/lib/chat";

export const dynamic = "force-dynamic";

// GET — lista de rooms del usuario con último mensaje y no leídos
export async function GET() {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });

  // Asegurar que el usuario esté en el room "Todos" de la tienda
  await ensureGroupRoom(session.storeId, session.userId);

  await touchPresence(session.userId);

  const memberships = await prisma.chatMember.findMany({
    where: { userId: session.userId },
    include: {
      room: {
        include: {
          members: { include: { user: { select: { id: true, name: true, photoUrl: true, role: true, lastSeenAt: true } } } },
          messages: {
            where: { hiddenFor: { none: { userId: session.userId } } },
            orderBy: { createdAt: "desc" },
            take: 1,
            include: { sender: { select: { name: true } } }
          }
        }
      }
    }
  });

  // Marcar como entregados todos los mensajes ajenos pendientes (estando en la lista).
  const roomIds = memberships.map((m) => m.roomId);
  if (roomIds.length > 0) {
    const undelivered = await prisma.chatMessage.findMany({
      where: {
        roomId: { in: roomIds },
        senderId: { not: session.userId },
        deliveredTo: { none: { userId: session.userId } }
      },
      select: { id: true }
    });
    if (undelivered.length > 0) {
      await prisma.chatMessageDelivery.createMany({
        data: undelivered.map((m) => ({ messageId: m.id, userId: session.userId })),
        skipDuplicates: true
      });
    }
  }

  const rooms = await Promise.all(
    memberships.map(async (m) => {
      const room = m.room;
      const lastMsg = room.messages[0] ?? null;
      const unreadCount = await prisma.chatMessage.count({
        where: {
          roomId: room.id,
          senderId: { not: session.userId },
          readBy: { none: { userId: session.userId } },
          hiddenFor: { none: { userId: session.userId } }
        }
      });
      const otherUser = room.type === "DIRECT"
        ? room.members.find((mem) => mem.userId !== session.userId)?.user ?? null
        : null;
      const other = otherUser
        ? {
            id: otherUser.id,
            name: otherUser.name,
            photoUrl: otherUser.photoUrl,
            role: otherUser.role,
            online: isOnline(otherUser.lastSeenAt),
            lastSeenAt: otherUser.lastSeenAt ? otherUser.lastSeenAt.toISOString() : null
          }
        : null;

      return {
        id: room.id,
        type: room.type,
        name: room.type === "GROUP" ? (room.name ?? "Todos") : null,
        other,
        lastMessage: lastMsg
          ? {
              body: lastMsg.deletedAt ? "" : lastMsg.body,
              deleted: lastMsg.deletedAt !== null,
              senderName: lastMsg.sender.name,
              createdAt: lastMsg.createdAt.toISOString()
            }
          : null,
        unreadCount
      };
    })
  );

  // GROUP primero, luego DIRECT ordenados por último mensaje
  rooms.sort((a, b) => {
    if (a.type === "GROUP" && b.type !== "GROUP") return -1;
    if (b.type === "GROUP" && a.type !== "GROUP") return 1;
    const ta = a.lastMessage?.createdAt ?? "";
    const tb = b.lastMessage?.createdAt ?? "";
    return tb.localeCompare(ta);
  });

  return NextResponse.json({ rooms });
}

// POST — crear o recuperar un room directo
export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });

  const body = await request.json() as { targetUserId?: string };
  const { targetUserId } = body;
  if (!targetUserId) return NextResponse.json({ error: "targetUserId requerido." }, { status: 400 });
  if (targetUserId === session.userId) return NextResponse.json({ error: "No puedes chatear contigo mismo." }, { status: 400 });

  // Verificar que el target sea del mismo store
  const target = await prisma.user.findFirst({ where: { id: targetUserId, storeId: session.storeId } });
  if (!target) return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 });

  // Buscar room DIRECT existente entre ambos
  const existing = await prisma.chatRoom.findFirst({
    where: {
      storeId: session.storeId,
      type: "DIRECT",
      members: { some: { userId: session.userId } },
      AND: [{ members: { some: { userId: targetUserId } } }]
    }
  });

  if (existing) return NextResponse.json({ room: { id: existing.id } });

  const room = await prisma.chatRoom.create({
    data: {
      storeId: session.storeId,
      type: "DIRECT",
      members: {
        create: [{ userId: session.userId }, { userId: targetUserId }]
      }
    }
  });

  return NextResponse.json({ room: { id: room.id } });
}

async function ensureGroupRoom(storeId: string, userId: string) {
  let group = await prisma.chatRoom.findFirst({ where: { storeId, type: "GROUP" } });
  if (!group) {
    const allUsers = await prisma.user.findMany({ where: { storeId, active: true }, select: { id: true } });
    group = await prisma.chatRoom.create({
      data: {
        storeId,
        type: "GROUP",
        name: "Todos",
        members: { create: allUsers.map((u) => ({ userId: u.id })) }
      }
    });
  } else {
    // Agregar usuario si todavía no es miembro
    await prisma.chatMember.upsert({
      where: { roomId_userId: { roomId: group.id, userId } },
      update: {},
      create: { roomId: group.id, userId }
    });
  }
}
