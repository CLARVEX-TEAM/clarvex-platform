import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminCapture } from "@/lib/admin-capture-auth";
import { prisma } from "@/lib/prisma";
import { montoValido } from "@/lib/campana";
import { datosDeRango, guardarSemana } from "@/lib/campana-datos";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Tailored Help desde Retool (calendario de gerencia). Mismo candado que el
 * resto de la captura: `ADMIN_CAPTURE_SECRET` y el `storeId` lo pone el backend
 * de Retool desde la identidad del usuario, nunca la pantalla.
 *
 * Guarda con la MISMA función que la pantalla de la app (`guardarSemana`): dos
 * puertas al mismo dato con reglas distintas acabarían diciendo cosas distintas.
 */

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const DIA_MS = 86_400_000;

export async function GET(request: Request) {
  const unauthorized = requireAdminCapture(request);
  if (unauthorized) return unauthorized;
  const params = new URL(request.url).searchParams;
  const storeId = params.get("storeId") ?? "";
  const desde = params.get("desde") ?? "";
  const hasta = params.get("hasta") ?? "";
  if (!storeId || !FECHA.test(desde) || !FECHA.test(hasta)) {
    return NextResponse.json({ error: "storeId, desde y hasta (AAAA-MM-DD) son obligatorios." }, { status: 400 });
  }
  const inicio = new Date(`${desde}T00:00:00Z`);
  const fin = new Date(`${hasta}T00:00:00Z`);
  if (fin < inicio || fin.getTime() - inicio.getTime() > 62 * DIA_MS) {
    return NextResponse.json({ error: "El rango debe ser de máximo dos meses." }, { status: 400 });
  }
  const datos = await datosDeRango(storeId, inicio, fin);
  if (!datos) return NextResponse.json({ ok: true, activa: false });
  return NextResponse.json({ ok: true, activa: true, ...datos });
}

const cuerpo = z.object({
  storeId: z.string().min(1).max(64),
  fecha: z.string().regex(FECHA),
  /** Vacío o null deja la meta como estaba. */
  meta: z.unknown().optional(),
  aportes: z
    .array(z.object({ userId: z.string().min(1), monto: z.unknown(), donativos: z.number().int().min(0).max(500).optional() }))
    .max(60)
    .default([]),
  actor: z.string().max(120).optional()
});

export async function POST(request: Request) {
  const unauthorized = requireAdminCapture(request);
  if (unauthorized) return unauthorized;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }
  const parsed = cuerpo.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Cuerpo inválido.", detail: parsed.error.issues.map((i) => i.message) }, { status: 400 });
  const { storeId, fecha, aportes, actor } = parsed.data;

  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { id: true } });
  if (!store) return NextResponse.json({ error: "Tienda no encontrada." }, { status: 404 });

  const metas = [];
  if (parsed.data.meta !== undefined && parsed.data.meta !== null && parsed.data.meta !== "") {
    const meta = montoValido(parsed.data.meta);
    if (meta === null) return NextResponse.json({ error: "La meta no es un monto válido." }, { status: 422 });
    metas.push({ fecha, meta });
  }
  const limpios = [];
  for (const a of aportes) {
    const vacio = a.monto === null || a.monto === undefined || a.monto === "";
    const monto = vacio ? null : montoValido(a.monto);
    if (!vacio && monto === null) return NextResponse.json({ error: "Hay un monto que no es válido." }, { status: 422 });
    limpios.push({ userId: a.userId, fecha, monto, donativos: a.donativos });
  }

  try {
    await guardarSemana(storeId, new Date(`${fecha}T00:00:00Z`), { metas, aportes: limpios }, `retool:${actor ?? "captura"}`);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo guardar." }, { status: 422 });
  }
  return NextResponse.json({ ok: true });
}
