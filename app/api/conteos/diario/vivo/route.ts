import { NextResponse } from "next/server";
import { z } from "zod";
import { isApiError, requireSession } from "@/lib/api";
import { claveDiario, latir, presentes, retirar } from "@/lib/conteo-presence";
import { COUNT_KIND_DAILY, SECTION_DAMA } from "@/lib/daily-count";
import { huellaDelDia } from "@/lib/conteo-vivo";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * El pulso del conteo diario: quién está contando y si algo cambió.
 *
 * ⚠️ **Una sola petición hace las dos cosas.** Presencia y estado se preguntan
 * al mismo ritmo y desde la misma pantalla; con dos endpoints serían el doble
 * de peticiones para responder a la misma pregunta —«¿ha pasado algo?»— y
 * podrían contestar cosas de dos instantes distintos.
 *
 * ⚠️ **No devuelve el conteo, solo una HUELLA.** El estado completo son todos
 * los marbetes con sus tres conteos; traerlo cada tres segundos es mover mucho
 * para que casi siempre esté igual. La pantalla vuelve a pedirlo solo cuando la
 * huella cambia.
 *
 * ⚠️ **Y no devuelve piezas de nadie.** Ni aquí ni en la presencia: el conteo es
 * ciego, y el número que otra persona acaba de teclear es justo lo que no puede
 * verse. Van nombres, números de marbete y marcas de tiempo.
 */

const consulta = z.object({
  section: z.string().min(1).max(24).default(SECTION_DAMA),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** En qué marbete está. Nulo si está en la lista, sin entrar a ninguno. */
  tagNumber: z.coerce.number().int().positive().nullable().optional()
});

function dayOf(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

export async function POST(request: Request) {
  const session = await requireSession();
  if (isApiError(session)) return session;

  const crudo = (await request.json().catch(() => ({}))) as unknown;
  const leido = consulta.safeParse(crudo);
  if (!leido.success) {
    return NextResponse.json({ error: "Petición inválida." }, { status: 400 });
  }
  const { section, date, tagNumber } = leido.data;

  const clave = claveDiario(session.storeId, section, date);

  await latir(clave, session.userId, session.name, tagNumber ?? null);

  const [present, conteo] = await Promise.all([
    presentes(clave, session.userId),
    prisma.cycleCount.findFirst({
      where: {
        storeId: session.storeId,
        kind: COUNT_KIND_DAILY,
        section,
        date: dayOf(date)
      },
      select: {
        entries: {
          select: { tagId: true, count1At: true, count2At: true, count3At: true }
        }
      }
    })
  ]);

  return NextResponse.json(
    { present, huella: huellaDelDia(conteo?.entries ?? []) },
    { headers: { "Cache-Control": "no-store" } }
  );
}

/** Salir: al cerrar la pantalla, para no esperar a que caduque el latido. */
export async function DELETE(request: Request) {
  const session = await requireSession();
  if (isApiError(session)) return session;

  const crudo = (await request.json().catch(() => ({}))) as unknown;
  const leido = consulta.safeParse(crudo);
  if (!leido.success) return NextResponse.json({ ok: true });

  await retirar(claveDiario(session.storeId, leido.data.section, leido.data.date), session.userId);
  return NextResponse.json({ ok: true });
}
