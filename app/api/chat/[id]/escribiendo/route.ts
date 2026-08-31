/**
 * `POST /api/chat/[id]/escribiendo` — «está escribiendo…».
 *
 * Marca la hora y ya. Quien lo enseña es el endpoint de espera, que ya está
 * mirando la sala cada 400 ms: montar aquí un segundo canal solo para esto
 * sería una conexión más abierta por persona a cambio de nada.
 *
 * ⚠️ **El navegador lo llama como mucho una vez cada 3 s**, no en cada tecla.
 * Sin ese freno, escribir un mensaje de veinte letras serían veinte escrituras
 * en la base por cada persona que teclea.
 */

import { NextResponse } from "next/server";
import { requireSession, isApiError, denyDemo } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  if (isApiError(session)) return session;

  // Los usuarios demo son COMPARTIDOS entre visitantes: uno tecleando pondría
  // «está escribiendo» a todos los demás a la vez.
  const demo = denyDemo(session);
  if (demo) return demo;

  /*
   * `updateMany` y no `update`: si la persona no es miembro de la sala,
   * actualiza cero filas y se acabó. Con `update` habría que consultar antes
   * para no reventar, y serían dos viajes a la base en algo que ocurre cada
   * tres segundos mientras alguien teclea.
   */
  const { count } = await prisma.chatMember.updateMany({
    where: { roomId: id, userId: session.userId },
    data: { typingAt: new Date() }
  });

  if (count === 0) {
    return NextResponse.json({ error: "No tienes acceso a este chat." }, { status: 403 });
  }
  return NextResponse.json({ ok: true });
}
