import { NextResponse } from "next/server";
import { z } from "zod";
import { isApiError, parseJson, requirePlatformAdmin } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const billingSchema = z.object({
  billingExempt: z.boolean(),
  // Fecha "pagado hasta" (fin de ese día). null = sin pago registrado.
  subscriptionPaidUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Usa formato YYYY-MM-DD.").nullable()
});

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requirePlatformAdmin();
  if (isApiError(session)) return session;

  const parsed = await parseJson(request, billingSchema);
  if ("response" in parsed) return parsed.response;

  const store = await prisma.store.findUnique({ where: { id }, select: { id: true } });
  if (!store) return NextResponse.json({ error: "Tienda no encontrada." }, { status: 404 });

  const updated = await prisma.store.update({
    where: { id },
    data: {
      billingExempt: parsed.data.billingExempt,
      subscriptionPaidUntil: parsed.data.subscriptionPaidUntil
        ? new Date(`${parsed.data.subscriptionPaidUntil}T23:59:59.999Z`)
        : null
    },
    select: { id: true, billingExempt: true, subscriptionPaidUntil: true }
  });

  return NextResponse.json({ store: updated });
}
