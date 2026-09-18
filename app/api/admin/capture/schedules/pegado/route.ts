import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminCapture } from "@/lib/admin-capture-auth";
import { resolveMonterreyDate } from "@/lib/cron-time";
import { prisma } from "@/lib/prisma";
import { parseSchedulePaste } from "@/lib/schedule-parser";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Lee el bloque de horarios que se copia del Excel y se pega en Retool.
 *
 * ⚠️ **Esto NO guarda nada.** Solo traduce y enseña lo que entendió; guardar
 * sigue siendo `POST /api/admin/capture/schedules`, el mismo endpoint de
 * siempre, con sus mismas reglas.
 *
 * La separación es deliberada y tiene historia: el importador por pegado de
 * Cuota Justa se retiró en agosto de 2026 justamente por ser una SEGUNDA puerta
 * al mismo dato --pegar un bloque viejo sobrescribía metas ya aplicadas sin que
 * nada avisara--. Aquí el pegado es un traductor, no una puerta: quien escribe
 * es el de siempre, y entre medias hay una persona mirando lo que se entendió.
 *
 * ⚠️ Y esto decide el SUELDO: de estos días salen los retardos, el banco de
 * minutos, la prima dominical y el reparto de Cuota Justa. Por eso devuelve
 * `problemas` --lo que impide guardar-- separado de `avisos` --lo que hay que
 * mirar antes de confirmar--, en vez de mezclarlo todo en un error.
 */

const esquema = z.object({
  storeId: z.string().min(1).max(64),
  // Un mes de la hoja son ~5 bloques de 8 filas; 200 KB sobra y acota el abuso.
  texto: z.string().min(10).max(200_000)
});

export async function POST(request: Request) {
  const noAutorizado = requireAdminCapture(request);
  if (noAutorizado) return noAutorizado;

  const cuerpo = await request.json().catch(() => null);
  const parsed = esquema.safeParse(cuerpo);
  if (!parsed.success) {
    return NextResponse.json({ error: "Falta la tienda o el texto pegado." }, { status: 400 });
  }

  const tienda = await prisma.store.findUnique({ where: { id: parsed.data.storeId }, select: { id: true } });
  if (!tienda) return NextResponse.json({ error: "Esa tienda no existe." }, { status: 404 });

  const leido = parseSchedulePaste(parsed.data.texto);

  const entries = leido.records.map((registro) => ({
    employeeNumber: registro.employeeNumber,
    date: registro.date.toISOString().slice(0, 10),
    status: registro.status,
    startTime: registro.startTime,
    endTime: registro.endTime
  }));

  /*
   * ⚠️ Avisar de los días que YA PASARON es el freno del bloque viejo.
   *
   * Pegar la semana equivocada reescribe días que la gente ya trabajó, y con
   * ellos su asistencia. No se bloquea --a veces se corrige el pasado a
   * propósito-- pero no puede pasar desapercibido.
   */
  const hoy = resolveMonterreyDate().dateKey;
  const pasados = entries.filter((e) => e.date < hoy);
  const avisos: string[] = [];
  if (pasados.length > 0) {
    const fechas = Array.from(new Set(pasados.map((e) => e.date))).sort();
    avisos.push(
      `${pasados.length} día(s) del pegado ya pasaron (${fechas[0]} a ${fechas[fechas.length - 1]}). ` +
        "Si guardas, se reescribe el horario de días ya trabajados."
    );
  }

  const conHorario = entries.filter((e) => e.startTime).length;
  if (conHorario === 0 && entries.length > 0) {
    avisos.push(
      "Ninguna celda trae hora. Se guardará solo el estado; los días de trabajo tomarán el horario estándar de la tienda. " +
        "Para un turno distinto, escribe la hora en la celda: «LABORANDO 12:00-21:00»."
    );
  }

  /** Resumen por persona, que es como se revisa de un vistazo. */
  const porPersona = new Map<string, { nombre: string; dias: Record<string, number> }>();
  for (const registro of leido.records) {
    const actual = porPersona.get(registro.employeeNumber) ?? { nombre: registro.employeeName, dias: {} };
    actual.dias[registro.status] = (actual.dias[registro.status] ?? 0) + 1;
    porPersona.set(registro.employeeNumber, actual);
  }

  return NextResponse.json(
    {
      ok: leido.problemas.length === 0,
      // Listo para mandarlo tal cual a /api/admin/capture/schedules.
      entries,
      problemas: leido.problemas,
      avisos,
      semanas: leido.weeks,
      resumen: {
        personas: porPersona.size,
        dias: entries.length,
        conHorario,
        porPersona: Array.from(porPersona.entries()).map(([employeeNumber, datos]) => ({
          employeeNumber,
          nombre: datos.nombre,
          ...datos.dias
        }))
      }
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
