import { NextResponse } from "next/server";
import { isApiError, requireSession } from "@/lib/api";
import { getFromR2 } from "@/lib/r2";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/files/photo?k=<key> — sirve una foto de perfil desde R2 con las
// credenciales del servidor, sin depender del acceso público del bucket.
//
// Las fotos de perfil las ve todo el equipo (así está definido en el producto),
// así que basta con tener sesión. Se restringe el prefijo a `profiles/` para que
// este endpoint no se pueda usar como lector genérico del bucket (las evidencias
// van por URL firmada, con su propia autorización).
export async function GET(request: Request) {
  const session = await requireSession();
  if (isApiError(session)) return session;

  const key = new URL(request.url).searchParams.get("k") ?? "";
  if (!key.startsWith("profiles/") || key.includes("..") || key.length > 500) {
    return NextResponse.json({ error: "Ruta inválida." }, { status: 400 });
  }

  const object = await getFromR2(key);
  if (!object) return NextResponse.json({ error: "Foto no encontrada." }, { status: 404 });

  return new NextResponse(Buffer.from(object.body), {
    headers: {
      "Content-Type": object.contentType,
      // Privada: la cachea el navegador del usuario, nunca un proxy compartido.
      "Cache-Control": "private, max-age=86400",
      "Content-Length": String(object.body.length)
    }
  });
}
