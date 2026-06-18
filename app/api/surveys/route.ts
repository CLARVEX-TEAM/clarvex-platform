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
      where: { storeId: session.storeId },
      orderBy: { createdAt: "desc" },
      include: {
        questions: { orderBy: { order: "asc" }, select: { id: true, text: true, type: true, order: true } },
        responses: { select: { userId: true } }
      }
    }),
    prisma.user.count({ where: { storeId: session.storeId } })
  ]);

  return NextResponse.json({
    isManager,
    totalRecipients,
    surveys: surveys.map((survey) => ({
      id: survey.id,
      title: survey.title,
      description: survey.description,
      anonymous: survey.anonymous,
      active: survey.active,
      createdAt: survey.createdAt.toISOString(),
      questions: survey.questions,
      responded: survey.responses.some((response) => response.userId === session.userId),
      responseCount: survey.responses.length
    }))
  });
}

const createSchema = z.object({
  title: z.string().trim().min(2, "Escribe un título.").max(140),
  description: z.string().trim().max(500).optional(),
  anonymous: z.boolean().optional().default(true),
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
  const { title, description, anonymous, questions } = parsed.data;

  const survey = await prisma.survey.create({
    data: {
      storeId: session.storeId,
      authorId: session.userId,
      title,
      description: description || null,
      anonymous,
      questions: { create: questions.map((question, index) => ({ text: question.text, type: question.type, order: index })) }
    }
  });

  const recipients = await prisma.user.findMany({
    where: { storeId: session.storeId, id: { not: session.userId } },
    select: { id: true }
  });
  const recipientIds = recipients.map((recipient) => recipient.id);
  if (recipientIds.length > 0) {
    await createNotifications(prisma, recipientIds.map((id) => ({
      storeId: session.storeId, userId: id, type: "SURVEY" as const, title: "Nueva encuesta", body: title
    })));
    dispatchPushToUsers(recipientIds, { title: "📝 Nueva encuesta", body: title, tag: "encuesta", url: "/encuestas" }).catch(() => undefined);
  }

  return NextResponse.json({ id: survey.id }, { status: 201 });
}
