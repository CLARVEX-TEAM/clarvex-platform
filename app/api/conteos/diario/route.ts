import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession, isApiError, parseJson } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { entryReal } from "@/lib/cycle-count";
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
  const countedData =
    pieces === undefined
      ? {}
      : {
          count1: pieces,
          count1ById: session.userId,
          count1ByName: session.name,
          count1At: new Date()
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
