import { NextResponse } from "next/server";
import { denyDemo, isApiError, requirePlatformAdmin } from "@/lib/api";
import { decodePosDocument, POS_HISTORY_DAYS, posFailureStore } from "@/lib/pos-failure-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const privateHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow",
  "Content-Security-Policy": "default-src 'none'; sandbox"
};
const extensions = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "application/pdf": "pdf" };

/** Sesión real de admin de plataforma. El secreto de captura NO permite consultar originales. */
export async function GET(request: Request) {
  const session = await requirePlatformAdmin();
  if (isApiError(session)) {
    for (const [name, value] of Object.entries(privateHeaders)) session.headers.set(name, value);
    return session;
  }
  if (denyDemo(session)) return NextResponse.json({ error: "Acceso no disponible en demo." }, { status: 403, headers: privateHeaders });
  const query = new URL(request.url).searchParams;
  const id = query.get("id");
  const format = query.get("format") ?? "diagnostic";
  const storeId = query.get("storeId") ?? undefined;
  if ((format !== "diagnostic" && format !== "original") || (format === "original" && !id) || (storeId?.length ?? 0) > 64) {
    return NextResponse.json({ error: "Consulta inválida." }, { status: 400, headers: privateHeaders });
  }
  try {
    const history = posFailureStore();
    if (!id) {
      return NextResponse.json({ entries: await history.list(storeId), retentionDays: POS_HISTORY_DAYS }, { headers: privateHeaders });
    }
    const record = await history.read(id);
    if (!record || (storeId && record.storeId !== storeId)) {
      return NextResponse.json({ error: "Diagnóstico no encontrado o caducado." }, { status: 404, headers: privateHeaders });
    }
    if (format === "original") {
      return new Response(new Uint8Array(decodePosDocument(record.documentBase64)), {
        headers: { ...privateHeaders, "Content-Type": "application/octet-stream",
          "Content-Disposition": `attachment; filename="pos-${record.id}.${extensions[record.mimeType]}"` }
      });
    }
    // El JSON de diagnóstico no duplica el archivo; se descarga por separado.
    const { documentBase64: _document, ...diagnostic } = record;
    return NextResponse.json(diagnostic, { headers: { ...privateHeaders,
      "Content-Disposition": `attachment; filename="pos-${record.id}.json"` } });
  } catch {
    console.warn("[pos-history] No se pudo consultar el historial privado.");
    return NextResponse.json({ error: "El historial no está disponible; intenta más tarde." }, { status: 503, headers: privateHeaders });
  }
}
