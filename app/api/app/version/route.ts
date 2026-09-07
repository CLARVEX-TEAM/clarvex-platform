import { NextResponse } from "next/server";
import { isApiError, requireSession } from "@/lib/api";
import { firmarDescarga } from "@/lib/apk-descarga";
import { versionPublicada } from "@/lib/version-app";

export const dynamic = "force-dynamic";

/**
 * Qué versión de la app de Android hay publicada, y el enlace para bajarla.
 *
 * ⚠️ **Exige sesión.** El enlace de descarga se firma aquí y vale diez minutos:
 * sin sesión no hay enlace. El APK es el binario de la app de la tienda y no
 * tiene por qué estar al alcance de cualquiera.
 */
export async function GET() {
  const session = await requireSession();
  if (isApiError(session)) return session;

  const version = versionPublicada();
  if (!version) {
    // No hay APK publicado. No es un error: la app simplemente no ofrece nada.
    return NextResponse.json({ hay: false });
  }

  return NextResponse.json({
    hay: true,
    versionCode: version.versionCode,
    versionName: version.versionName,
    novedades: version.novedades,
    publicada: version.publicada,
    bytes: version.bytes,
    sha256: version.sha256,
    url: `/api/app/apk?t=${await firmarDescarga(session.userId, version.versionCode)}`
  });
}
