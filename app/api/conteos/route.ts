import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession, isApiError, parseJson } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { entryReal } from "@/lib/cycle-count";
import { COUNT_KIND_PHYSICAL } from "@/lib/daily-count";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET — lista de conteos con su avance (todos los roles).
export async function GET() {
  const session = await requireSession();
  if (isApiError(session)) return session;

  const [counts, activeTags] = await Promise.all([
    prisma.cycleCount.findMany({
      // Solo los físicos. El conteo diario de una sección vive en su propia
      // pantalla: mezclarlos aquí llenaría la lista del inventario quincenal de
      // conteos parciales con los que no se compara.
      where: { storeId: session.storeId, kind: COUNT_KIND_PHYSICAL },
      include: { entries: { select: { count1: true, count2: true, count3: true } } },
      orderBy: { date: "desc" },
      take: 24
    }),
    prisma.cycleCountTag.count({ where: { storeId: session.storeId, active: true } })
  ]);

  return NextResponse.json({
    totalTags: activeTags,
    counts: counts.map((count) => {
      const counted = count.entries.filter((entry) => entryReal(entry) !== null).length;
      const pieces = count.entries.reduce((total, entry) => total + (entryReal(entry) ?? 0), 0);
      return {
        id: count.id,
        date: count.date.toISOString().slice(0, 10),
        status: count.status,
        theoretical: count.theoretical,
        counted,
        totalTags: activeTags,
        pieces
      };
    })
  });
}

const createSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  theoretical: z.number().int().min(0).max(9_999_999).nullable().optional(),
  notes: z.string().max(300).optional()
});

// POST — gerencia abre un conteo nuevo.
export async function POST(request: Request) {
  const session = await requireSession(["GERENTE", "SUBGERENTE"]);
  if (isApiError(session)) return session;
  const parsed = await parseJson(request, createSchema);
  if ("response" in parsed) return parsed.response;
  const body = parsed.data;

  // ⚠️ El candado de «un solo conteo abierto» es del FÍSICO. Sin acotarlo por
  // tipo, el conteo diario de dama —que se abre todos los días— impediría abrir
  // el inventario quincenal.
  const open = await prisma.cycleCount.findFirst({
    where: { storeId: session.storeId, status: "OPEN", kind: COUNT_KIND_PHYSICAL }
  });
  if (open) return NextResponse.json({ error: "Ya hay un conteo abierto. Ciérralo antes de abrir otro." }, { status: 409 });

  const tags = await prisma.cycleCountTag.count({ where: { storeId: session.storeId, active: true } });
  if (tags === 0) return NextResponse.json({ error: "Primero da de alta los marbetes de la tienda." }, { status: 400 });

  const count = await prisma.cycleCount.create({
    data: {
      storeId: session.storeId,
      date: new Date(`${body.date}T00:00:00.000Z`),
      theoretical: body.theoretical ?? null,
      notes: body.notes?.trim() || null
    }
  });

  await recordAudit({
    session,
    storeId: session.storeId,
    action: "cyclecount.create",
    entity: "CycleCount",
    entityId: count.id,
    detail: `Conteo del ${body.date} abierto`
  });

  return NextResponse.json({ id: count.id }, { status: 201 });
}
