import { NextResponse } from "next/server";
import { DATA_SOURCE_ROLES } from "@/lib/access-control";
import { denyDemo, isApiError, requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { createEmbedUrl } from "@/lib/retool-embed";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Devuelve una URL de un solo uso para incrustar la app de captura de Retool.
 *
 * Toda la identidad sale de la SESIÓN de Clarvex: quién es, de qué tienda y con
 * qué rol. El cuerpo de la petición no se lee, y es a propósito — si el
 * `storeId` viniera del cliente, una gerente podría pedir una URL para otra
 * tienda y capturarle los horarios.
 *
 * Se exige rol de gerencia (`DATA_SOURCE_ROLES`), que es el mismo criterio con
 * el que ya se protege el Centro de Datos.
 */
export async function POST() {
  const session = await requireSession(DATA_SOURCE_ROLES);
  if (isApiError(session)) return session;
  // La demo es de solo lectura y además consumiría cupo de usuario externo.
  const demo = denyDemo(session);
  if (demo) return demo;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, name: true, email: true, role: true, storeId: true, store: { select: { name: true } } }
  });
  if (!user || !user.storeId) {
    return NextResponse.json({ error: "Usuario sin tienda asignada." }, { status: 409 });
  }

  const outcome = await createEmbedUrl({
    id: user.id,
    name: user.name,
    email: user.email,
    storeId: user.storeId,
    storeName: user.store?.name ?? "",
    role: user.role
  });
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });

  return NextResponse.json({ ok: true, url: outcome.url });
}
