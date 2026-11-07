import { NextResponse, after } from "next/server";
import { z } from "zod";
import { denyDemo, isApiError, parseJson, requireSession } from "@/lib/api";
import { TEMA_CAMPANA, montoValido, vistaPara } from "@/lib/campana";
import { acumuladoCampana, guardarSemana, resumenDeSemana } from "@/lib/campana-datos";
import { revisarReconocimientos } from "@/lib/reconocimientos-envio";
import { todayInMonterrey } from "@/lib/mexico-timezone";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const GERENCIA = new Set(["GERENTE", "SUBGERENTE"]);
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

function fechaDe(valor: string | null): Date {
  return valor && FECHA.test(valor) ? new Date(`${valor}T00:00:00Z`) : todayInMonterrey();
}

/**
 * La semana de Tailored Help de la tienda, con el ranking de todos. Capturar
 * es solo de gerencia.
 */
export async function GET(request: Request) {
  const session = await requireSession();
  if (isApiError(session)) return session;
  const gerencia = GERENCIA.has(session.role) || session.platformAdmin;
  const fecha = fechaDe(new URL(request.url).searchParams.get("semana"));

  const [resumen, acumulado] = await Promise.all([
    resumenDeSemana(session.storeId, fecha),
    acumuladoCampana(session.storeId, session.userId)
  ]);
  if (!resumen) return NextResponse.json({ activa: false });
  return NextResponse.json({
    activa: true,
    tema: TEMA_CAMPANA,
    gerencia,
    yo: session.userId,
    resumen: vistaPara(resumen),
    acumulado
  });
}

const cuerpo = z.object({
  semana: z.string().regex(FECHA),
  metas: z.array(z.object({ fecha: z.string().regex(FECHA), meta: z.unknown() })).max(7).optional(),
  aportes: z
    .array(
      z.object({
        userId: z.string().min(1),
        fecha: z.string().regex(FECHA),
        /** Vacío o null borra el aporte de ese día. */
        monto: z.unknown(),
        donativos: z.number().int().min(0).max(500).optional()
      })
    )
    .max(300)
    .optional()
});

export async function POST(request: Request) {
  const session = await requireSession(["GERENTE", "SUBGERENTE"]);
  if (isApiError(session)) return session;
  const demo = denyDemo(session);
  if (demo) return demo;

  const leido = await parseJson(request, cuerpo);
  if (leido.response) return leido.response;
  const parsed = leido.data;

  const metas = [];
  for (const m of parsed.metas ?? []) {
    const meta = montoValido(m.meta);
    if (meta === null) return NextResponse.json({ error: `La meta del ${m.fecha} no es un monto válido.` }, { status: 400 });
    metas.push({ fecha: m.fecha, meta });
  }
  const aportes = [];
  for (const a of parsed.aportes ?? []) {
    const vacio = a.monto === null || a.monto === undefined || a.monto === "";
    const monto = vacio ? null : montoValido(a.monto);
    if (!vacio && monto === null) return NextResponse.json({ error: `Un monto del ${a.fecha} no es válido.` }, { status: 400 });
    aportes.push({ userId: a.userId, fecha: a.fecha, monto, donativos: a.donativos });
  }

  const fecha = fechaDe(parsed.semana);
  try {
    await guardarSemana(session.storeId, fecha, { metas, aportes }, session.userId);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo guardar." }, { status: 400 });
  }
  const resumen = await resumenDeSemana(session.storeId, fecha);
  const storeId = session.storeId;
  after(() => revisarReconocimientos(storeId).catch((e) => console.error("[reconocimientos]", e instanceof Error ? e.message : e)));
  return NextResponse.json({ ok: true, resumen });
}
