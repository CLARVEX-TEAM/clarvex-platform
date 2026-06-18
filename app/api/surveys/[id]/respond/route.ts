import { NextResponse } from "next/server";
import { z } from "zod";
import { isApiError, parseJson, requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({
  answers: z.array(z.object({
    questionId: z.string().min(1),
    rating: z.number().int().min(1).max(5).optional(),
    text: z.string().trim().max(500).optional()
  })).min(1)
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  if (isApiError(session)) return session;

  const parsed = await parseJson(request, schema);
  if ("response" in parsed) return parsed.response;

  const survey = await prisma.survey.findFirst({
    where: { id, storeId: session.storeId },
    include: { questions: { select: { id: true } }, responses: { where: { userId: session.userId }, select: { id: true } } }
  });
  if (!survey) return NextResponse.json({ error: "Encuesta no encontrada." }, { status: 404 });
  if (!survey.active) return NextResponse.json({ error: "Esta encuesta ya está cerrada." }, { status: 400 });
  if (survey.responses.length > 0) return NextResponse.json({ error: "Ya respondiste esta encuesta." }, { status: 409 });

  const validQuestionIds = new Set(survey.questions.map((question) => question.id));
  const answers = parsed.data.answers.filter((answer) => validQuestionIds.has(answer.questionId));
  if (answers.length === 0) return NextResponse.json({ error: "Respuestas no válidas." }, { status: 400 });

  await prisma.surveyResponse.create({
    data: {
      surveyId: id,
      userId: session.userId,
      answers: { create: answers.map((answer) => ({ questionId: answer.questionId, rating: answer.rating ?? null, text: answer.text || null })) }
    }
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}
