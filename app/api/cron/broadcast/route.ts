import { NextResponse } from "next/server";
import { requireCron } from "@/lib/cron-auth";
import { dispatchPushToUsers } from "@/lib/push";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Difusión manual de un aviso push a todo el equipo activo. Protegido con
 * CRON_SECRET (se dispara desde el servidor, no desde la app). Reutilizable para
 * anuncios puntuales: nueva versión, mantenimiento, recordatorios generales.
 *
 * Body JSON: { title: string; body: string; url?: string }
 * dispatchPushToUsers ya filtra a usuarios activos con suscripción vigente.
 */
export async function POST(request: Request) {
  const unauthorized = requireCron(request);
  if (unauthorized) return unauthorized;

  const payload = (await request.json().catch(() => null)) as
    | { title?: string; body?: string; url?: string }
    | null;
  const title = (payload?.title ?? "").trim().slice(0, 100);
  const message = (payload?.body ?? "").trim().slice(0, 300);
  const url = ((payload?.url ?? "/").trim() || "/").slice(0, 200);
  if (!title || !message) {
    return NextResponse.json({ error: "Faltan 'title' y 'body'." }, { status: 400 });
  }

  const users = await prisma.user.findMany({ where: { active: true }, select: { id: true } });
  await dispatchPushToUsers(users.map((u) => u.id), { title, body: message, tag: "anuncio", url });

  return NextResponse.json({ ok: true, targetedUsers: users.length });
}
