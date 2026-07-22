import { NextResponse } from "next/server";
import { requireSession, isApiError } from "@/lib/api";
import { acceptanceKey, LEGAL_DOCUMENTS } from "@/lib/legal";
import { clientIp } from "@/lib/request-ip";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Documentos legales que al usuario le falta aceptar (nuevos o con versión nueva). */
async function pendingFor(userId: string) {
  const accepted = await prisma.legalAcceptance.findMany({
    where: { userId },
    select: { document: true, version: true }
  });
  const acceptedSet = new Set(accepted.map((a) => acceptanceKey(a.document, a.version)));
  return LEGAL_DOCUMENTS.filter((doc) => !acceptedSet.has(acceptanceKey(doc.key, doc.version)));
}

// GET — ¿qué documentos legales debe aceptar el usuario?
export async function GET() {
  const session = await requireSession();
  if (isApiError(session)) return session;

  const pending = await pendingFor(session.userId);
  return NextResponse.json({
    accepted: pending.length === 0,
    documents: LEGAL_DOCUMENTS,
    pending
  });
}

// POST — firma: registra la aceptación de los documentos pendientes con IP y
// user-agent. Los pendientes se recalculan en el SERVIDOR (no se confía en el
// cliente sobre qué se firma).
export async function POST(request: Request) {
  const session = await requireSession();
  if (isApiError(session)) return session;

  const pending = await pendingFor(session.userId);
  if (pending.length === 0) return NextResponse.json({ ok: true });

  const ip = clientIp(request.headers);
  const userAgent = request.headers.get("user-agent")?.slice(0, 400) ?? null;

  await prisma.legalAcceptance.createMany({
    data: pending.map((doc) => ({
      userId: session.userId,
      storeId: session.storeId,
      document: doc.key,
      version: doc.version,
      ip,
      userAgent
    })),
    skipDuplicates: true
  });

  // Compatibilidad con el mecanismo anterior basado en User.termsAcceptedVersion.
  const terms = pending.find((doc) => doc.key === "terms");
  if (terms) {
    await prisma.user.update({
      where: { id: session.userId },
      data: { termsAcceptedAt: new Date(), termsAcceptedVersion: terms.version }
    });
  }

  return NextResponse.json({ ok: true });
}
