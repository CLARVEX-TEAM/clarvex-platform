import { prisma } from "@/lib/prisma";
import { dispatchPushToUsers } from "@/lib/push";
import { laboranHoy } from "@/lib/whatsapp-canal";
import { ETIQUETA, textoVentaEnVivo, type DatosVenta } from "@/lib/venta-en-vivo-texto";

/**
 * La venta en vivo en el teléfono (y en el Pixel Watch): cada vez que gerencia
 * captura venta de HOY, a cada quien le llega UNA notificación que reemplaza a
 * la anterior, sin sonar:
 *
 *   Hoy llevas $3,450 · 69 %
 *   Te faltan $1,550 para tu meta · 4:32 pm
 *
 * Gerencia además ve la tienda en la misma notificación.
 *
 * ⚠️ **Siempre la misma etiqueta y en el canal silencioso.** La etiqueta hace
 * que se reemplace en vez de apilarse; el canal, que no suene. Las dos cosas
 * juntas son lo que separa «la tengo a la vista» de «me llenan el teléfono».
 *
 * ⚠️ **No pasa por WhatsApp** (`avisar`), a propósito: un mensaje por cada
 * captura en temporada alta es exactamente el spam que se quitó el 8 nov 2026.
 *
 * ⚠️ **Es una notificación NORMAL, no fija («ongoing»).** Android no manda las
 * fijas al reloj; las normales sí. Si alguien la desliza, vuelve con la
 * siguiente captura.
 */

/**
 * Manda la venta de HOY de la tienda a quien trabaja hoy. Nunca lanza: una
 * notificación que no sale no puede tumbar la captura que la provocó.
 */
export async function avisarVentaEnVivo(storeId: string, hoy: Date): Promise<number> {
  try {
    const filas = await prisma.kpi.findMany({
      where: { storeId, date: hoy, user: { active: true, checklistOnly: false, isDemo: false } },
      select: { userId: true, dailySales: true, dailyGoal: true, transactions: true, pieces: true, user: { select: { role: true } } }
    });
    if (filas.length === 0) return 0;

    const tienda: DatosVenta = {
      venta: filas.reduce((t, f) => t + Number(f.dailySales), 0),
      meta: filas.reduce((t, f) => t + Number(f.dailyGoal), 0)
    };
    const gerencia = await prisma.user.findMany({
      where: { storeId, active: true, checklistOnly: false, isDemo: false, role: { in: ["GERENTE", "SUBGERENTE"] } },
      select: { id: true }
    });
    const ids = Array.from(new Set([...filas.map((f) => f.userId), ...gerencia.map((g) => g.id)]));
    const laboran = await laboranHoy(ids, hoy);
    const esGerencia = new Set(gerencia.map((g) => g.id));
    const hora = new Intl.DateTimeFormat("es-MX", { timeZone: "America/Monterrey", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date());

    let enviados = 0;
    await Promise.allSettled(
      ids.filter((id) => laboran.has(id)).map(async (id) => {
        const fila = filas.find((f) => f.userId === id);
        const capturo = fila && (Number(fila.dailySales) !== 0 || fila.transactions > 0 || fila.pieces > 0);
        const propia = fila && (capturo || Number(fila.dailyGoal) > 0) ? { venta: Number(fila.dailySales), meta: Number(fila.dailyGoal) } : null;
        const texto = textoVentaEnVivo({ propia, tienda: esGerencia.has(id) ? tienda : null, hora });
        if (!texto) return;
        await dispatchPushToUsers([id], { ...texto, tag: ETIQUETA, url: "/kpis", silencioso: true });
        enviados += 1;
      })
    );
    return enviados;
  } catch (error) {
    console.error("[venta-en-vivo]", error instanceof Error ? error.message : error);
    return 0;
  }
}
