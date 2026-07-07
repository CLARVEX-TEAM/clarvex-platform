import { NextResponse } from "next/server";
import { isApiError, requireSession } from "@/lib/api";
import { monthlyAmount, pricePerUser, subscriptionState } from "@/lib/billing";
import { billingEnabled } from "@/lib/mercadopago";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Estado de la suscripción de la tienda para la pantalla de gerencia.
export async function GET() {
  const session = await requireSession(["GERENTE", "SUBGERENTE"], { allowSuspended: true });
  if (isApiError(session)) return session;

  const [store, activeUsers] = await Promise.all([
    prisma.store.findUnique({
      where: { id: session.storeId },
      select: {
        name: true, billingExempt: true, subscriptionPaidUntil: true, pricePerUserMxn: true,
        subscriptionPayments: { orderBy: { paidAt: "desc" }, take: 6, select: { id: true, amountMxn: true, method: true, paidAt: true, periodEnd: true } }
      }
    }),
    prisma.user.count({ where: { storeId: session.storeId, active: true } })
  ]);
  if (!store) return NextResponse.json({ error: "Tienda no encontrada." }, { status: 404 });

  const { state, daysLeft } = subscriptionState({ billingExempt: store.billingExempt, subscriptionPaidUntil: store.subscriptionPaidUntil });
  const storePrice = store.pricePerUserMxn ? Number(store.pricePerUserMxn) : null;

  return NextResponse.json({
    storeName: store.name,
    state,
    daysLeft,
    activeUsers,
    pricePerUserMxn: pricePerUser(storePrice),
    amountMxn: monthlyAmount(activeUsers, storePrice),
    paidUntil: store.subscriptionPaidUntil?.toISOString() ?? null,
    canPayOnline: billingEnabled(),
    payments: store.subscriptionPayments.map((payment) => ({
      id: payment.id,
      amountMxn: Number(payment.amountMxn),
      method: payment.method,
      paidAt: payment.paidAt.toISOString(),
      periodEnd: payment.periodEnd.toISOString()
    }))
  }, { headers: { "Cache-Control": "private, no-store" } });
}
