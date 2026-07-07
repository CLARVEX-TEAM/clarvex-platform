import { NextResponse } from "next/server";
import { isApiError, requireSession } from "@/lib/api";
import { monthlyAmount } from "@/lib/billing";
import { billingEnabled, createPreference } from "@/lib/mercadopago";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Gerencia genera el link de pago de la mensualidad (Mercado Pago Checkout Pro).
export async function POST(request: Request) {
  const session = await requireSession(["GERENTE", "SUBGERENTE"], { allowSuspended: true });
  if (isApiError(session)) return session;

  if (!billingEnabled()) {
    return NextResponse.json({ error: "Los pagos en línea aún no están configurados. Contacta a administración." }, { status: 503 });
  }

  const [store, activeUsers] = await Promise.all([
    prisma.store.findUnique({ where: { id: session.storeId }, select: { id: true, name: true, pricePerUserMxn: true } }),
    prisma.user.count({ where: { storeId: session.storeId, active: true } })
  ]);
  if (!store) return NextResponse.json({ error: "Tienda no encontrada." }, { status: 404 });

  const amountMxn = monthlyAmount(activeUsers, store.pricePerUserMxn ? Number(store.pricePerUserMxn) : null);
  const origin = process.env.WEBAUTHN_ORIGIN || new URL(request.url).origin;

  try {
    const { initPoint } = await createPreference({
      storeId: store.id,
      storeName: store.name,
      amountMxn,
      successUrl: `${origin}/suscripcion?pago=ok`,
      failureUrl: `${origin}/suscripcion?pago=error`,
      notificationUrl: `${origin}/api/webhooks/mercadopago`
    });
    return NextResponse.json({ initPoint, amountMxn });
  } catch (cause) {
    console.error("checkout:", cause);
    return NextResponse.json({ error: "No se pudo iniciar el pago. Intenta de nuevo en un momento." }, { status: 502 });
  }
}
