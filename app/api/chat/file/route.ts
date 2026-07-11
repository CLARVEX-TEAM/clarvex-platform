import { NextResponse } from "next/server";
import { requireSession, isApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { getFromR2 } from "@/lib/r2";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/chat/file?k=<key> — sirve una imagen del chat desde R2 con las
// credenciales del servidor (no depende del acceso público del bucket).
// Solo los miembros del room pueden verla.
export async function GET(request: Request) {
  const session = await requireSession();
  if (isApiError(session)) return session;

  const key = new URL(request.url).searchParams.get("k") ?? "";
  const parts = key.split("/");
  // Formato esperado: evidences/chat/<roomId>/<archivo>
  if (parts[0] !== "evidences" || parts[1] !== "chat" || parts.length < 4) {
    return NextResponse.json({ error: "Ruta inválida." }, { status: 400 });
  }
  const roomId = parts[2];

  const member = await prisma.chatMember.findUnique({
    where: { roomId_userId: { roomId, userId: session.userId } }
  });
  if (!member) return NextResponse.json({ error: "Sin acceso." }, { status: 403 });

  const object = await getFromR2(key);
  if (!object) return NextResponse.json({ error: "Imagen no encontrada." }, { status: 404 });

  return new NextResponse(Buffer.from(object.body), {
    headers: {
      "Content-Type": object.contentType,
      "Cache-Control": "private, max-age=86400",
      "Content-Length": String(object.body.length)
    }
  });
}
