import { NextResponse } from "next/server";
import { requireSession, isApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { headersAllowEmbed, normalizeStreamUrl } from "@/lib/stream-url";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/match/stream-check?id=… — verifica del lado del servidor si el
// enlace de transmisión permite mostrarse en un iframe (X-Frame-Options/CSP).
// El navegador no puede leer esos headers por CORS; el servidor sí.
export async function GET(request: Request) {
  const session = await requireSession();
  if (isApiError(session)) return session;

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Falta el partido." }, { status: 400 });

  const match = await prisma.matchEvent.findUnique({ where: { id }, select: { streamUrl: true } });
  if (!match?.streamUrl) return NextResponse.json({ embeddable: false, reason: "sin-enlace" });
  const target = normalizeStreamUrl(match.streamUrl);

  // Los embeds de YouTube siempre permiten iframe; no hace falta consultar.
  if (/^https:\/\/www\.youtube(-nocookie)?\.com\/embed\//.test(target)) {
    return NextResponse.json({ embeddable: true });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(target, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ClarvexTeam/1.0)" }
    });
    return NextResponse.json({ embeddable: headersAllowEmbed(res.headers) });
  } catch {
    // Si el sitio no responde al servidor, dejamos que el iframe lo intente.
    return NextResponse.json({ embeddable: true, unverified: true });
  } finally {
    clearTimeout(timeout);
  }
}
