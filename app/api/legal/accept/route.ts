import { NextResponse } from "next/server";
import { requireSession, isApiError } from "@/lib/api";
import { TERMS_VERSION } from "@/lib/legal";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET — ¿el usuario ya aceptó la versión vigente de términos y privacidad?
export async function GET() {
  const session = await requireSession();
  if (isApiError(session)) return session;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { termsAcceptedVersion: true, termsAcceptedAt: true }
  });
  return NextResponse.json({
    accepted: user?.termsAcceptedVersion === TERMS_VERSION,
    version: TERMS_VERSION,
    acceptedAt: user?.termsAcceptedAt?.toISOString() ?? null
  });
}

// POST — registrar la aceptación (fecha + versión: evidencia de consentimiento).
export async function POST() {
  const session = await requireSession();
  if (isApiError(session)) return session;

  await prisma.user.update({
    where: { id: session.userId },
    data: { termsAcceptedAt: new Date(), termsAcceptedVersion: TERMS_VERSION }
  });
  return NextResponse.json({ ok: true, version: TERMS_VERSION });
}
