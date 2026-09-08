import { NextResponse } from "next/server";
import { z } from "zod";
import { isApiError, parseJson, requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * El borrador de promoción que espera revisión, para la pantalla de comunicados.
 *
 * ⚠️ **Solo gerencia**, igual que crear un comunicado. Un asesor no publica, así
 * que enseñarle una promoción a medio revisar solo serviría para que la diera
 * por buena antes de tiempo.
 *
 * ⚠️ Y **por tienda**, con el `storeId` de la sesión y nunca de un parámetro: el
 * correo del corporativo llega a más de veinte tiendas y cada una tiene lo suyo.
 */
export async function GET() {
  const session = await requireSession(["GERENTE", "SUBGERENTE"]);
  if (isApiError(session)) return session;

  const borrador = await prisma.promoDraft.findFirst({
    where: { storeId: session.storeId, usedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, body: true, createdAt: true }
  });

  return NextResponse.json({ borrador });
}

/**
 * Marca el borrador como usado para que deje de ofrecerse.
 *
 * ⚠️ **No se borra.** Si el comunicado sale mal, este borrador es lo único que
 * dice qué decía el correo. Borrarlo dejaría la corrección sin nada contra qué
 * compararse.
 */
export async function POST(request: Request) {
  const session = await requireSession(["GERENTE", "SUBGERENTE"]);
  if (isApiError(session)) return session;

  const parsed = await parseJson(request, z.object({ id: z.string().min(1) }));
  if ("response" in parsed) return parsed.response;

  // ⚠️ El `storeId` va en el WHERE: sin él, una gerencia podría cerrar el
  // borrador de otra tienda mandando su id.
  const { count } = await prisma.promoDraft.updateMany({
    where: { id: parsed.data.id, storeId: session.storeId, usedAt: null },
    data: { usedAt: new Date() }
  });

  return NextResponse.json({ ok: count > 0 });
}
