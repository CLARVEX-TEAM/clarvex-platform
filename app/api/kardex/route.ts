import { NextResponse } from "next/server";
import { isApiError, requireSession } from "@/lib/api";
import { buildInventoryDaily, dailyChange, type DailySalePoint } from "@/lib/inventory-daily";
import { getKardexState } from "@/lib/inventory-kardex";
import { type InventoryMovementType } from "@/lib/inventory-kardex-entry";
import { prisma } from "@/lib/prisma";
import { PERSON_WHERE } from "@/lib/store-people";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Tope de movimientos que viajan a la pantalla.
 *
 * Generoso a propósito: una ronda son unos dos meses y la tienda más cargada no
 * llega a cien. Lo que NO puede pasar es cortar sin decirlo, porque encima de
 * esta lista se suman piezas a mano.
 */
const TOPE_MOVIMIENTOS = 500;

/**
 * Kardex de la tienda de la sesión, para las pantallas de Clarvex.
 *
 * ⚠️ No confundir con `/api/inventory`, que es el reporte de FALTANTES de
 * producto (con foto y aviso a gerencia). Son cosas distintas pese al nombre.
 *
 * Solo lectura: la captura vive en Retool y entra por
 * `/api/admin/capture/inventory`. Aquí la tienda sale de la SESIÓN, nunca de un
 * parámetro, así que nadie puede pedir el inventario de otra.
 *
 * Devuelve además la serie día a día, que es lo que hace legible un kardex: el
 * número de hoy dice poco; la línea dice si viene subiendo o bajando.
 */
export async function GET() {
  const session = await requireSession();
  if (isApiError(session)) return session;

  const state = await getKardexState(session.storeId);
  if (!state.round || !state.summary) {
    return NextResponse.json(
      { round: null, summary: null, difference: null, daily: [], change: null, movements: [] },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  }

  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  // Una ronda cerrada se congela en su día de cierre: seguir dibujando días
  // después haría una línea plana que se leería como inventario vivo.
  const until =
    state.round.endDate && state.round.endDate.getTime() < today.getTime() ? state.round.endDate : today;

  const salesRows = await prisma.kpi.groupBy({
    by: ["date"],
    where: { storeId: session.storeId, date: { gte: state.round.startDate, lte: until }, user: PERSON_WHERE },
    _sum: { pieces: true }
  });
  const sales: DailySalePoint[] = salesRows.map((row) => ({ date: row.date, pieces: row._sum.pieces ?? 0 }));

  const daily = buildInventoryDaily({
    basePieces: state.round.basePieces,
    startDate: state.round.startDate,
    until,
    movements: state.movements.map((movement) => ({
      date: movement.date,
      type: movement.type as InventoryMovementType,
      quantity: movement.quantity
    })),
    sales
  });

  return NextResponse.json(
    {
      round: {
        name: state.round.name,
        startDate: state.round.startDate.toISOString().slice(0, 10),
        basePieces: state.round.basePieces,
        endDate: state.round.endDate ? state.round.endDate.toISOString().slice(0, 10) : null,
        closingPieces: state.round.closingPieces,
        open: state.round.endDate === null
      },
      summary: state.summary,
      difference: state.difference,
      daily,
      change: dailyChange(daily),
      /*
       * ⚠️ **Van TODOS los de la ronda, no los últimos sesenta.**
       *
       * El recorte anterior valía cuando la pantalla solo los ENSEÑABA. Desde
       * que se pueden marcar filas y sumarlas, una lista cortada devuelve un
       * total que se lee como completo y no lo es — y el kardex de esta tienda
       * ya iba por 50 de los 60 que se mandaban.
       *
       * El tope sigue existiendo para que una ronda desbocada no tire la
       * pantalla, pero ahora se DECLARA: `movementsTruncated` es lo que le
       * permite a la pantalla negarse a sumar, en vez de sumar de menos.
       */
      movementsTruncated: state.movements.length > TOPE_MOVIMIENTOS,
      movements: state.movements.slice(0, TOPE_MOVIMIENTOS).map((movement) => ({
        id: movement.id,
        date: movement.date.toISOString().slice(0, 10),
        type: movement.type,
        quantity: movement.quantity,
        reference: movement.reference,
        counterpart: movement.counterpart,
        note: movement.note,
        createdBy: movement.createdBy
      }))
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
