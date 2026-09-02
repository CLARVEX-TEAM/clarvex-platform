/**
 * `GET|POST /api/admin/capture/kpi-targets` — objetivos internos desde Retool.
 *
 * Son los números contra los que se pinta el semáforo: UPT, AUR, EPT,
 * conversión, margen, cumplimiento, WhatsApp y los dos de ticket electrónico.
 * **No son las metas de venta**, que viven en `Kpi.dailyGoal` y las siembra la
 * Cuota Justa.
 *
 * ⚠️ **Hay que añadir esta ruta a `captureRoutes` en `middleware.ts`.** Sin
 * eso responde «Sesión requerida» antes de llegar a validar el secreto, y ese
 * mensaje hace pensar en permisos de Retool y no en una lista blanca. Ya pasó
 * con el export del RDV.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminCapture } from "@/lib/admin-capture-auth";
import { prisma } from "@/lib/prisma";
import { METRICAS, PERIODOS, validar, type Periodo } from "@/lib/kpi-target-capture";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const storeIdSchema = z.string().trim().min(1).max(64);

const saveSchema = z.object({
  storeId: storeIdSchema,
  /**
   * Quién lo captura, para poder preguntarle después.
   *
   * ⚠️ Es una **etiqueta**, no el id de un usuario de Clarvex. Retool no lo
   * conoce: `requireManagerIdentity` solo entrega tienda y rol, así que manda
   * el correo de quien opera. Se guarda con prefijo `retool:` para que se
   * distinga de los valores viejos, que sí eran ids —y para no acabar con la
   * misma persona escrita de tres formas, como pasó en el kardex.
   */
  capturedBy: z.string().trim().min(1).max(120).optional(),
  targets: z
    .array(
      z.object({
        metric: z.string().trim().min(1).max(64),
        period: z.string().trim().min(1).max(16),
        value: z.union([z.number(), z.string()])
      })
    )
    .min(1)
    .max(50)
});

async function tiendaExiste(storeId: string) {
  return Boolean(await prisma.store.findUnique({ where: { id: storeId }, select: { id: true } }));
}

/** Lo guardado hoy, completado con las métricas que aún no tienen objetivo. */
async function cargar(storeId: string) {
  const filas = await prisma.kpiTarget.findMany({
    where: { storeId },
    select: { metric: true, period: true, value: true, updatedAt: true }
  });

  const guardado = new Map(filas.map((f) => [`${f.metric}|${f.period}`, f]));

  const targets = Object.entries(METRICAS).flatMap(([metric, config]) =>
    PERIODOS.map((period) => {
      const fila = guardado.get(`${metric}|${period}`);
      return {
        metric,
        period,
        etiqueta: config.etiqueta,
        unidad: config.unidad,
        // Se manda para que la pantalla NO llame «meta» a un techo.
        techo: config.techo === true,
        // `null` y no 0: un 0 diría que el objetivo es cero, y lo que pasa es
        // que todavía no se ha puesto.
        value: fila ? Number(fila.value) : null,
        updatedAt: fila?.updatedAt.toISOString() ?? null
      };
    })
  );

  return { targets };
}

export async function GET(request: Request) {
  const unauthorized = requireAdminCapture(request);
  if (unauthorized) return unauthorized;

  const parsed = storeIdSchema.safeParse(new URL(request.url).searchParams.get("storeId"));
  if (!parsed.success) return NextResponse.json({ error: "Tienda inválida." }, { status: 400 });
  if (!(await tiendaExiste(parsed.data))) {
    return NextResponse.json({ error: "Tienda no encontrada." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, ...(await cargar(parsed.data)) });
}

export async function POST(request: Request) {
  const unauthorized = requireAdminCapture(request);
  if (unauthorized) return unauthorized;

  let cuerpo: unknown;
  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }

  const parsed = saveSchema.safeParse(cuerpo);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  }
  const { storeId, capturedBy, targets } = parsed.data;
  const autor = `retool:${capturedBy ?? "sin-identificar"}`;

  if (!(await tiendaExiste(storeId))) {
    return NextResponse.json({ error: "Tienda no encontrada." }, { status: 404 });
  }

  /*
   * Se valida TODO antes de escribir NADA.
   *
   * Guardando sobre la marcha, un dedazo en la séptima métrica dejaría las
   * seis primeras aplicadas y el resto no: la pantalla mostraría un error y
   * un estado a medias que nadie sabe si volver a mandar.
   */
  const limpios: Array<{ metric: string; period: Periodo; value: number }> = [];
  for (const t of targets) {
    const r = validar(t.metric, t.period, t.value);
    if (!r.ok) return NextResponse.json({ error: r.motivo }, { status: 400 });
    limpios.push({ metric: t.metric, period: t.period as Periodo, value: r.valor });
  }

  /*
   * Una transacción y no un bucle: si el proceso se cae a media escritura,
   * media pantalla quedaría con objetivos nuevos y la otra media con los
   * viejos. Y eso no se ve — el semáforo sigue pintando, solo que contra
   * números de dos momentos distintos.
   */
  await prisma.$transaction(
    limpios.map((t) =>
      prisma.kpiTarget.upsert({
        where: { storeId_metric_period: { storeId, metric: t.metric, period: t.period } },
        update: { value: t.value, createdBy: autor, updatedAt: new Date() },
        create: { storeId, metric: t.metric, value: t.value, period: t.period, createdBy: autor }
      })
    )
  );

  return NextResponse.json({ ok: true, guardados: limpios.length, ...(await cargar(storeId)) });
}
