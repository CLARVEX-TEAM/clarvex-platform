import { NextResponse } from "next/server";
import { denyDemo, isApiError, requirePlatformAdmin } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { appUrl } from "@/lib/email";
import { issueResetToken, TOKEN_TTL_MS } from "@/lib/pin-reset";
import { prisma } from "@/lib/prisma";
import { clientIp } from "@/lib/request-ip";

export const dynamic = "force-dynamic";

/**
 * Emite un enlace de PIN para un miembro de la tienda y lo DEVUELVE, en vez de
 * mandarlo por correo.
 *
 * Existe por un bloqueo circular real: al abrir una tienda nueva, su gerente no
 * tiene PIN, y `employee-login` solo deja crear uno con una sesión de gerencia
 * de esa MISMA tienda ya iniciada (`canSetupPin`). Como en una tienda recién
 * creada no hay nadie dentro, nadie puede autorizar a nadie y la cuenta queda
 * inservible. El camino por correo tampoco sirve: la mayoría de las cuentas
 * llevan un `<numero>@clarvex.local` inventado al que no llega nada.
 *
 * Se emite un ENLACE y no un PIN a propósito: quien lo emite nunca llega a
 * conocer el PIN, así que no existe una ventana en la que pueda entrar
 * suplantando a esa persona. El enlace caduca, es de un solo uso, y al canjearlo
 * `consumeResetToken` limpia el bloqueo por intentos fallidos y sube
 * `sessionVersion`, cerrando cualquier sesión anterior.
 *
 * Sirve igual para quien nunca tuvo PIN que para quien lo olvidó: el canje solo
 * escribe `pinHash`, no exige que ya hubiera uno.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; userId: string }> }) {
  const { id, userId } = await params;

  const session = await requirePlatformAdmin();
  if (isApiError(session)) return session;
  // requirePlatformAdmin ya bastaría (una sesión demo nunca es admin), pero el
  // candado va explícito: es la regla para todo endpoint que escribe.
  const demoBlocked = denyDemo(session);
  if (demoBlocked) return demoBlocked;

  const user = await prisma.user.findFirst({
    where: { id: userId, storeId: id },
    select: { id: true, name: true, employeeNumber: true, active: true, store: { select: { name: true } } }
  });
  if (!user) return NextResponse.json({ error: "Usuario no encontrado en esta tienda." }, { status: 404 });
  if (!user.active) {
    return NextResponse.json({ error: "La cuenta está desactivada. Reactívala antes de emitir el enlace." }, { status: 409 });
  }

  const token = await issueResetToken(user.id, clientIp(request.headers) || null);
  const url = `${appUrl()}/recuperar/${encodeURIComponent(token)}`;

  // Se audita la EMISIÓN, nunca el enlace: el registro de auditoría lo pueden
  // leer otros administradores, y el token vale por sí solo para fijar el PIN.
  await recordAudit({
    session,
    action: "user.pin_reset_link",
    entity: "User",
    entityId: user.id,
    storeId: id,
    storeName: user.store.name,
    detail: `Emitió un enlace de PIN para ${user.name} (#${user.employeeNumber}).`
  });

  return NextResponse.json({ url, expiresInMinutes: Math.round(TOKEN_TTL_MS / 60000) });
}
