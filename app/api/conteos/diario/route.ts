import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession, isApiError, parseJson } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { entryNeedsRecount, entryReal } from "@/lib/cycle-count";
import {
  COUNT_KIND_DAILY,
  isDropReason,
  nextSectionPosition,
  SECTION_DAMA,
  summarize,
  type DailyRow
} from "@/lib/daily-count";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const sectionParam = z.string().min(1).max(24).default(SECTION_DAMA);

function dayOf(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

/**
 * Arma las filas del día: el juego de marbetes de la sección, cruzado contra el
 * conteo anterior de esa misma sección.
 */
async function buildState(storeId: string, section: string, date: string) {
  const [tags, today, previous] = await Promise.all([
    prisma.cycleCountTag.findMany({
      where: { storeId, section, active: true },
      orderBy: { sectionPosition: "asc" }
    }),
    prisma.cycleCount.findFirst({
      where: { storeId, kind: COUNT_KIND_DAILY, section, date: dayOf(date) },
      include: { entries: true }
    }),
    // El conteo anterior es el último ANTERIOR a hoy, no «el de ayer»: si la
    // tienda no contó un día, se compara contra el último que sí existe. Restar
    // contra un día en blanco inventaría faltantes del tamaño del área.
    prisma.cycleCount.findFirst({
      where: { storeId, kind: COUNT_KIND_DAILY, section, date: { lt: dayOf(date) } },
      orderBy: { date: "desc" },
      include: { entries: true }
    })
  ]);

  const currentByTag = new Map(today?.entries.map((entry) => [entry.tagId, entry]) ?? []);
  const previousByTag = new Map(previous?.entries.map((entry) => [entry.tagId, entry]) ?? []);

  const rows: DailyRow[] = tags.map((tag) => {
    const current = currentByTag.get(tag.id);
    const before = previousByTag.get(tag.id);
    const reason = current?.reason ?? null;
    return {
      number: tag.number,
      position: tag.sectionPosition ?? 0,
      label: tag.label,
      previous: before ? entryReal(before) : null,
      current: current ? entryReal(current) : null,
      count1: current?.count1 ?? null,
      count2: current?.count2 ?? null,
      count3: current?.count3 ?? null,
      needsRecount: current ? entryNeedsRecount(current) : false,
      reason: reason && isDropReason(reason) ? reason : null,
      reasonRef: current?.reasonRef ?? null
    };
  });

  return {
    section,
    date,
    countId: today?.id ?? null,
    status: today?.status ?? null,
    previousDate: previous ? previous.date.toISOString().slice(0, 10) : null,
    rows,
    summary: summarize(rows)
  };
}

// GET — estado del conteo diario de la sección (todos los roles).
export async function GET(request: Request) {
  const session = await requireSession();
  if (isApiError(session)) return session;

  const url = new URL(request.url);
  const section = sectionParam.parse(url.searchParams.get("section") ?? undefined);
  const date = url.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Fecha inválida." }, { status: 400 });
  }

  return NextResponse.json(await buildState(session.storeId, section, date));
}

const openSchema = z.object({
  section: sectionParam,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});

// POST — abre el conteo del día. Es idempotente: si ya existe, lo devuelve.
export async function POST(request: Request) {
  const session = await requireSession(["GERENTE", "SUBGERENTE"]);
  if (isApiError(session)) return session;
  const parsed = await parseJson(request, openSchema);
  if ("response" in parsed) return parsed.response;
  const { section, date } = parsed.data;

  const existing = await prisma.cycleCount.findFirst({
    where: { storeId: session.storeId, kind: COUNT_KIND_DAILY, section, date: dayOf(date) }
  });
  if (existing) return NextResponse.json({ id: existing.id });

  const count = await prisma.cycleCount.create({
    data: {
      storeId: session.storeId,
      date: dayOf(date),
      kind: COUNT_KIND_DAILY,
      section
    }
  });

  await recordAudit({
    session,
    storeId: session.storeId,
    action: "cyclecount.daily.open",
    entity: "CycleCount",
    entityId: count.id,
    detail: `Conteo diario de ${section} del ${date}`
  });

  return NextResponse.json({ id: count.id }, { status: 201 });
}

const saveSchema = z.object({
  countId: z.string().min(1),
  /** Marbete FÍSICO, el de la etiqueta que se escanea. */
  number: z.number().int().min(1).max(9_999),
  /**
   * Qué conteo se está capturando. Como en el conteo físico: vale el 1º, salvo
   * que el 2º difiera —ahí manda el 3º—. La resolución la hace `entryReal`, no
   * esta ruta.
   */
  slot: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  pieces: z.number().int().min(0).max(99_999).nullable().optional(),
  reason: z.string().max(24).nullable().optional(),
  reasonRef: z.string().max(64).nullable().optional()
});

// PATCH — captura un marbete. Si aún no es de la sección, lo enrola.
export async function PATCH(request: Request) {
  const session = await requireSession();
  if (isApiError(session)) return session;
  const parsed = await parseJson(request, saveSchema);
  if ("response" in parsed) return parsed.response;
  const body = parsed.data;

  const count = await prisma.cycleCount.findFirst({
    where: { id: body.countId, storeId: session.storeId, kind: COUNT_KIND_DAILY }
  });
  if (!count) return NextResponse.json({ error: "Conteo diario no encontrado." }, { status: 404 });
  if (count.status !== "OPEN") {
    return NextResponse.json({ error: "El conteo ya está cerrado." }, { status: 409 });
  }
  const section = count.section ?? SECTION_DAMA;

  const tag = await prisma.cycleCountTag.findFirst({
    where: { storeId: session.storeId, number: body.number }
  });
  if (!tag) {
    return NextResponse.json(
      { error: `El marbete ${body.number} no está dado de alta en la tienda.` },
      { status: 404 }
    );
  }
  if (tag.section && tag.section !== section) {
    return NextResponse.json(
      { error: `El marbete ${body.number} ya es de ${tag.section}.` },
      { status: 409 }
    );
  }

  /*
   * Enrolamiento: el juego de la sección se arma escaneando. La posición de
   * export se asigna aquí, una sola vez.
   *
   * ⚠️ Va dentro de una transacción con `nextSectionPosition` leído en el
   * momento: dos personas escaneando marbetes distintos a la vez calcularían la
   * misma posición y el índice único las rechazaría.
   */
  if (!tag.section) {
    await prisma.$transaction(async (tx) => {
      const taken = await tx.cycleCountTag.findMany({
        where: { storeId: session.storeId, section },
        select: { sectionPosition: true }
      });
      const position = nextSectionPosition(
        taken.map((item) => item.sectionPosition ?? 0)
      );
      await tx.cycleCountTag.update({
        where: { id: tag.id },
        data: { section, sectionPosition: position }
      });
    });
  }

  const reason = body.reason ?? null;
  if (reason !== null && !isDropReason(reason)) {
    return NextResponse.json({ error: "Motivo no válido." }, { status: 400 });
  }

  const existing = await prisma.cycleCountEntry.findFirst({
    where: { countId: count.id, tagId: tag.id }
  });

  // Las piezas solo se tocan si vienen: guardar un motivo no puede borrar el
  // conteo, y volver a contar no puede borrar el motivo que ya se escribió.
  const pieces = body.pieces === undefined ? undefined : body.pieces;
  const slot = body.slot ?? 1;
  const countedData =
    pieces === undefined
      ? {}
      : {
          [`count${slot}`]: pieces,
          [`count${slot}ById`]: session.userId,
          [`count${slot}ByName`]: session.name,
          [`count${slot}At`]: new Date()
        };

  if (existing) {
    await prisma.cycleCountEntry.update({
      where: { id: existing.id },
      data: {
        ...countedData,
        ...(body.reason === undefined ? {} : { reason }),
        ...(body.reasonRef === undefined ? {} : { reasonRef: body.reasonRef?.trim() || null })
      }
    });
  } else {
    await prisma.cycleCountEntry.create({
      data: {
        countId: count.id,
        tagId: tag.id,
        ...countedData,
        reason,
        reasonRef: body.reasonRef?.trim() || null
      }
    });
  }

  const date = count.date.toISOString().slice(0, 10);
  return NextResponse.json(await buildState(session.storeId, section, date));
}

const removeSchema = z.object({
  countId: z.string().min(1),
  number: z.number().int().min(1).max(9_999)
});

/**
 * DELETE — saca un marbete de la sección.
 *
 * ⚠️ Las posiciones solo se recorren mientras la sección va en su PRIMER
 * conteo. Ahí la lista se está armando y reordenar no rompe nada. En cuanto
 * existe un segundo conteo hay histórico —y reportes ya entregados— así que
 * quitar un marbete deja su posición vacía para siempre: si las de atrás se
 * recorrieran, el «marbete 3» de un reporte viejo pasaría a ser otro rack.
 */
export async function DELETE(request: Request) {
  const session = await requireSession(["GERENTE", "SUBGERENTE"]);
  if (isApiError(session)) return session;
  const parsed = await parseJson(request, removeSchema);
  if ("response" in parsed) return parsed.response;
  const body = parsed.data;

  const count = await prisma.cycleCount.findFirst({
    where: { id: body.countId, storeId: session.storeId, kind: COUNT_KIND_DAILY }
  });
  if (!count) return NextResponse.json({ error: "Conteo diario no encontrado." }, { status: 404 });
  if (count.status !== "OPEN") {
    return NextResponse.json({ error: "El conteo ya está cerrado." }, { status: 409 });
  }
  const section = count.section ?? SECTION_DAMA;

  const tag = await prisma.cycleCountTag.findFirst({
    where: { storeId: session.storeId, number: body.number, section }
  });
  if (!tag) {
    return NextResponse.json(
      { error: `El marbete ${body.number} no es de ${section}.` },
      { status: 404 }
    );
  }

  const totalCounts = await prisma.cycleCount.count({
    where: { storeId: session.storeId, kind: COUNT_KIND_DAILY, section }
  });
  const building = totalCounts <= 1;

  await prisma.$transaction(async (tx) => {
    // La captura de hoy se va con él: dejarla huérfana falsearía el avance.
    await tx.cycleCountEntry.deleteMany({ where: { countId: count.id, tagId: tag.id } });
    await tx.cycleCountTag.update({
      where: { id: tag.id },
      data: { section: null, sectionPosition: null }
    });

    if (!building) return;
    // Primer conteo: se recompactan las posiciones para que la lista quede 1..N
    // sin huecos, que es lo que se espera mientras se está armando.
    const rest = await tx.cycleCountTag.findMany({
      where: { storeId: session.storeId, section },
      orderBy: { sectionPosition: "asc" },
      select: { id: true }
    });
    for (let index = 0; index < rest.length; index += 1) {
      await tx.cycleCountTag.update({
        where: { id: rest[index].id },
        data: { sectionPosition: index + 1 }
      });
    }
  });

  await recordAudit({
    session,
    storeId: session.storeId,
    action: "cyclecount.daily.remove",
    entity: "CycleCountTag",
    entityId: tag.id,
    detail: `Marbete ${tag.number} fuera de ${section}${building ? " (posiciones recompactadas)" : ""}`
  });

  const date = count.date.toISOString().slice(0, 10);
  return NextResponse.json(await buildState(session.storeId, section, date));
}
