import { NextResponse } from "next/server";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { verificarDescarga } from "@/lib/apk-descarga";
import { archivoPublicado, rutaDelApk, versionPublicada } from "@/lib/version-app";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Entrega el APK a quien traiga un enlace firmado.
 *
 * ⚠️ **Aquí NO se pide sesión, y es deliberado.** Quien descarga es el
 * descargador nativo de Android, que va por fuera del WebView y no lleva la
 * cookie. La autorización la da el token, que solo se emite a una sesión válida
 * y caduca en diez minutos. Ver `lib/apk-descarga.ts`.
 */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("t") ?? "";
  const permiso = await verificarDescarga(token);
  if (!permiso) {
    return NextResponse.json({ error: "Enlace de descarga inválido o caducado." }, { status: 401 });
  }

  const version = versionPublicada();
  const archivo = archivoPublicado();
  if (!version || !archivo) {
    return NextResponse.json({ error: "No hay ninguna versión publicada." }, { status: 404 });
  }

  // ⚠️ El token dice PARA QUÉ VERSIÓN se emitió. Si mientras tanto se publicó
  // otra, se rechaza en vez de servir un binario cuyo SHA-256 ya no coincide
  // con el que la app va a comprobar: fallaría al instalar sin decir por qué.
  if (permiso.versionCode !== version.versionCode) {
    return NextResponse.json({ error: "Hay una versión más nueva. Vuelve a intentarlo." }, { status: 409 });
  }

  const flujo = Readable.toWeb(createReadStream(rutaDelApk(archivo))) as ReadableStream;
  return new NextResponse(flujo, {
    headers: {
      "Content-Type": "application/vnd.android.package-archive",
      "Content-Length": String(version.bytes),
      "Content-Disposition": `attachment; filename="clarvex-${version.versionName}.apk"`,
      "Cache-Control": "private, no-store"
    }
  });
}
