import { NextResponse } from "next/server";
import { NotificationType } from "@prisma/client";
import { extendSubscription, monthlyAmount } from "@/lib/billing";
import { getPayment } from "@/lib/mercadopago";
import { verifyMpSignature } from "@/lib/mercadopago-webhook";
import { createNotifications } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { dispatchPushToUsers } from "@/lib/push";
import { sendOpsAlert } from "@/lib/webhooks";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/*
 * Aviso de configuración, con freno.
 *
 * Solo se avisa cuando FALTA el secreto: eso es un problema nuestro y hay que
 * arreglarlo hoy. Una firma que no coincide NO avisa a propósito — este
 * endpoint es público, así que cualquiera podría convertir el canal de
 * Telegram en su propio timbre mandando basura firmada al azar.
 *
 * El freno es por proceso y PM2 corre dos instancias: como mucho salen dos
 * avisos por ventana. Es aceptable; multiplicarlo por cada webhook no.
 */
const AVISO_CADA_MS = 6 * 60 * 60 * 1000;
let ultimoAviso = 0;

async function avisarSecretoFaltante() {
  const now = Date.now();
  if (now - ultimoAviso < AVISO_CADA_MS) return;
  ultimoAviso = now;
  await sendOpsAlert({
    source: "mercadopago",
    title: "Webhook de Mercado Pago rechazando TODO",
    text:
      "Falta MERCADOPAGO_WEBHOOK_SECRET en el servidor, así que la verificación " +
      "de firma falla cerrada y cada pago recibe 401. Las suscripciones no se " +
      "están acreditando solas.\n\n" +
      "Se copia de Mercado Pago → Tus integraciones → la aplicación → Webhooks → " +
      "Clave secreta, se agrega al .env y se reinicia la app."
  });
}

// Webhook de Mercado Pago. MP solo envía el id del pago; NO se confía en el
// cuerpo: se vuelve a consultar el pago a la API de MP con nuestro token (fuente
// de verdad). Idempotente por mpPaymentId. Responde 200 siempre para que MP no
// reintente en bucle ante datos que no aplican.
export async function POST(request: Request) {
  let paymentId: string | null = null;
  try {
    const url = new URL(request.url);
    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const data = (body as { data?: { id?: string } }).data;
    const type = (body as { type?: string; topic?: string }).type ?? (body as { topic?: string }).topic ?? url.searchParams.get("type") ?? url.searchParams.get("topic");
    paymentId = data?.id ?? url.searchParams.get("data.id") ?? url.searchParams.get("id");
    if (type && type !== "payment") return NextResponse.json({ ok: true, ignored: type });
    if (!paymentId) return NextResponse.json({ ok: true, ignored: "sin id" });

    // Firma (si hay secreto configurado): rechaza webhooks no firmados.
    const firma = verifyMpSignature(request, paymentId);
    if (!firma.ok) {
      if (firma.reason === "sin-secreto") {
        console.error(
          "webhook mercadopago: FALTA MERCADOPAGO_WEBHOOK_SECRET; se rechazan todos los pagos",
          paymentId
        );
        await avisarSecretoFaltante();
      } else {
        console.error(`webhook mercadopago: firma inválida (${firma.reason})`, paymentId);
      }
      return NextResponse.json({ error: "Firma inválida." }, { status: 401 });
    }

    const payment = await getPayment(paymentId);
    if (payment.status !== "approved" || payment.currency_id !== "MXN") {
      return NextResponse.json({ ok: true, status: payment.status });
    }
    const storeId = payment.external_reference;
    if (!storeId) return NextResponse.json({ ok: true, ignored: "sin tienda" });

    // Idempotencia: si este pago ya se acreditó, no volver a extender.
    const existing = await prisma.subscriptionPayment.findUnique({ where: { mpPaymentId: String(payment.id) } });
    if (existing) return NextResponse.json({ ok: true, already: true });

    const store = await prisma.store.findUnique({ where: { id: storeId }, select: { id: true, subscriptionPaidUntil: true, pricePerUserMxn: true } });
    if (!store) return NextResponse.json({ ok: true, ignored: "tienda inexistente" });

    // Validación de monto: el pago debe cubrir la mensualidad esperada (usuarios
    // activos × precio). Se tolera 10% de deriva (altas/bajas entre checkout y
    // pago), pero se bloquea el subpago (p.ej. pagar $1 por una mensualidad alta).
    const activeUsers = await prisma.user.count({ where: { storeId, active: true } });
    const expected = monthlyAmount(activeUsers, store.pricePerUserMxn ? Number(store.pricePerUserMxn) : null);
    const paid = Number(payment.transaction_amount) || 0;
    if (paid + 0.01 < expected * 0.9) {
      console.error(`webhook mercadopago: monto insuficiente $${paid} < esperado $${expected} (tienda ${storeId}, pago ${payment.id})`);
      return NextResponse.json({ ok: true, ignored: "monto insuficiente" });
    }

    const periodEnd = extendSubscription(store.subscriptionPaidUntil, new Date());
    await prisma.$transaction(async (tx) => {
      await tx.subscriptionPayment.create({
        data: {
          storeId, mpPaymentId: String(payment.id), amountMxn: payment.transaction_amount,
          status: payment.status, method: payment.payment_method_id ?? payment.payment_type_id ?? null, periodEnd
        }
      });
      await tx.store.update({ where: { id: storeId }, data: { billingExempt: false, subscriptionPaidUntil: periodEnd } });
    });

    // Avisar a gerencia que el pago entró y la suscripción quedó activa.
    const managers = await prisma.user.findMany({ where: { storeId, active: true, role: { in: ["GERENTE", "SUBGERENTE"] } }, select: { id: true } });
    if (managers.length > 0) {
      const title = "Pago recibido ✅";
      const body2 = `Tu suscripción quedó activa hasta el ${periodEnd.toLocaleDateString("es-MX", { timeZone: "America/Monterrey", day: "numeric", month: "long" })}.`;
      await prisma.$transaction((tx) => createNotifications(tx, managers.map((m) => ({ storeId, userId: m.id, type: NotificationType.DAILY_SUMMARY, title, body: body2 }))));
      await dispatchPushToUsers(managers.map((m) => m.id), { title, body: body2, tag: "pago", url: "/suscripcion" }).catch(() => undefined);
    }

    return NextResponse.json({ ok: true, credited: true });
  } catch (cause) {
    console.error("webhook mercadopago:", paymentId, cause);
    // 200 para evitar reintentos en bucle; el error queda en logs.
    return NextResponse.json({ ok: false });
  }
}
