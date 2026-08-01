import { ADVISOR_WHERE, PERSON_WHERE } from "@/lib/store-people";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isApiError, parseJson, requireSession } from "@/lib/api";
import { createNotifications } from "@/lib/notifications";
import { dispatchPushToUsers } from "@/lib/push";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const session = await requireSession();
  if (isApiError(session)) return session;
  const isManager = session.role !== "ASESOR";

  const [surveys, totalRecipients] = await Promise.all([
    prisma.survey.findMany({
      // Un asesor no ve borradores: para él la encuesta existe cuando se
      // publica. Gerencia sí los ve, para poder terminarlos y publicarlos.
      where: { storeId: session.storeId, ...(isManager ? {} : { active: true }) },
      orderBy: { createdAt: "desc" },
      include: {
        questions: { orderBy: { order: "asc" }, select: { id: true, text: true, type: true, order: true } },
        responses: { select: { userId: true } }
      }
    }),
    prisma.user.count({ where: { storeId: session.storeId, ...PERSON_WHERE } })
  ]);

  return NextResponse.json({
    isManager,
    totalRecipients,
    surveys: surveys.map((survey) => ({
      id: survey.id,
      title: survey.title,
      description: survey.description,
      anonymous: survey.anonymous,
      audience: survey.audience,
      active: survey.active,
      createdAt: survey.createdAt.toISOString(),
      questions: survey.questions,
      // Si a ESTA persona le toca contestarla. Gerencia ve las encuestas de
      // solo-asesores para poder leer resultados, pero NO le salen como
      // pendientes: no son suyas.
      targeted: survey.audience === "ALL" || !isManager,
      responded: survey.responses.some((response) => response.userId === session.userId),
      responseCount: survey.responses.length
    }))
  });
}

const createSchema = z.object({
  title: z.string().trim().min(2, "Escribe un título.").max(140),
  description: z.string().trim().max(500).optional(),
  anonymous: z.boolean().optional().default(true),
  audience: z.enum(["ALL", "ADVISORS"]).optional().default("ALL"),
  // false = queda en BORRADOR: se guarda pero nadie se entera hasta publicar.
  publish: z.boolean().optional().default(true),
  questions: z.array(z.object({
    text: z.string().trim().min(2, "Cada pregunta necesita texto.").max(200),
    type: z.enum(["RATING", "TEXT"]).default("RATING")
  })).min(1, "Agrega al menos una pregunta.").max(15)
});

export async function POST(request: Request) {
  const session = await requireSession();
  if (isApiError(session)) return session;
  if (session.role === "ASESOR") return NextResponse.json({ error: "Solo gerencia puede crear encuestas." }, { status: 403 });

  const parsed = await parseJson(request, createSchema);
  if ("response" in parsed) return parsed.response;
  const { title, description, anonymous, audience, publish, questions } = parsed.data;

  const survey = await prisma.survey.create({
    data: {
      storeId: session.storeId,
      authorId: session.userId,
      title,
      description: description || null,
      anonymous,
      audience,
      active: publish,
      questions: { create: questions.map((question, index) => ({ text: question.text, type: question.type, order: index })) }
    }
  });

  // Un borrador no avisa a nadie: el aviso sale al publicar (PATCH).
  if (!publish) return NextResponse.json({ id: survey.id, draft: true }, { status: 201 });

  const recipients = await prisma.user.findMany({
    where: {
      storeId: session.storeId,
      ...(audience === "ADVISORS" ? ADVISOR_WHERE : PERSON_WHERE),
      id: { not: session.userId }
    },
    select: { id: true }
  });
  const recipientIds = recipients.map((recipient) => recipient.id);
  if (recipientIds.length > 0) {
    await createNotifications(prisma, recipientIds.map((id) => ({
      storeId: session.storeId, userId: id, type: "SURVEY" as const, title: "Nueva encuesta", body: title
    })));
    dispatchPushToUsers(recipientIds, { title: "📝 Nueva encuesta", body: title, tag: "encuesta", url: `/encuestas?encuesta=${survey.id}` }).catch(() => undefined);
  }

  return NextResponse.json({ id: survey.id }, { status: 201 });
}
