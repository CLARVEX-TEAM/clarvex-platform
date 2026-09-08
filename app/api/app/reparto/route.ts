import { NextResponse } from "next/server";
import { isApiError, requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { PERSON_WHERE } from "@/lib/store-people";
import { versionPublicada } from "@/lib/version-app";
import { resumirReparto } from "@/lib/reparto-app";

export const dynamic = "force-dynamic";

/**
 * Cómo va el reparto de la app en la tienda: quién la tiene y en qué versión.
 *
 * ⚠️ **Solo gerencia.** Dice qué aparato usa cada persona del equipo, y eso no
 * es asunto de un asesor. Es la misma línea que separa los KPI de tienda de los
 * personales.
 *
 * ⚠️ **Se responde por TIENDA**, con el `storeId` de la sesión y nunca de un
 * parámetro: una gerencia no puede mirar el reparto de otra tienda aunque
 * manipule la petición.
 *
 * ⚠️ **«Sin la app» no es lo mismo que «sin actualizar», y tampoco es
 * culpa de nadie.** Un aparato solo aparece cuando la app registra su token
 * para notificaciones; quien use la web desde el navegador no saldrá nunca.
 * Lo dice el propio resumen para que no se lea como una lista de morosos.
 */
export async function GET() {
  const session = await requireSession();
  if (isApiError(session)) return session;

  if (session.role === "ASESOR") {
    return NextResponse.json({ error: "Solo gerencia." }, { status: 403 });
  }

  const [gente, aparatos] = await Promise.all([
    prisma.user.findMany({
      where: { storeId: session.storeId, ...PERSON_WHERE },
      select: { id: true, name: true },
      orderBy: { name: "asc" }
    }),
    prisma.deviceToken.findMany({
      where: { user: { storeId: session.storeId, ...PERSON_WHERE } },
      select: { userId: true, appBuild: true, appVersion: true, updatedAt: true }
    })
  ]);

  const publicada = versionPublicada();
  return NextResponse.json(
    resumirReparto({
      gente,
      aparatos,
      versionPublicada: publicada?.versionCode ?? null,
      nombrePublicado: publicada?.versionName ?? null
    })
  );
}
