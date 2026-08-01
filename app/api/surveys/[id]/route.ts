import { ADVISOR_WHERE, PERSON_WHERE } from "@/lib/store-people";
import { climateIndex, isSplit } from "@/lib/survey-climate";
import { NextResponse } from "next/server";
import { isApiError, requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Resultados de la encuesta (solo gerencia). Respeta el anonimato: si la encuesta
// es anónima, los textos no incluyen el nombre de quien respondió.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  if (isApiError(session)) return session;
  if (session.role === "ASESOR") return NextResponse.json({ error: "Solo gerencia." }, { status: 403 });

  const survey = await prisma.survey.findFirst({
    where: { id, storeId: session.storeId },
    include: {
      questions: { orderBy: { order: "asc" } },
      responses: {
        include: {
          user: { select: { name: true, photoUrl: true } },
          answers: true
        }
      }
    }
  });
  if (!survey) return NextResponse.json({ error: "Encuesta no encontrada." }, { status: 404 });

  const totalRecipients = await prisma.user.count({
    where: {
      storeId: session.storeId,
      ...(survey.audience === "ADVISORS" ? ADVISOR_WHERE : PERSON_WHERE)
    }
  });

  const questions = survey.questions.map((question) => {
    const answers = survey.responses.flatMap((response) =>
      response.answers
        .filter((answer) => answer.questionId === question.id)
        .map((answer) => ({ answer, response }))
    );
    if (question.type === "RATING") {
      const ratings = answers.map((entry) => entry.answer.rating).filter((value): value is number => value !== null);
      const distribution = [1, 2, 3, 4, 5].map((star) => ratings.filter((value) => value === star).length);
      const average = ratings.length ? ratings.reduce((sum, value) => sum + value, 0) / ratings.length : null;
      return { id: question.id, text: question.text, type: "RATING" as const, average, count: ratings.length, distribution, split: isSplit(distribution) };
    }
    const texts = answers
      .map((entry) => ({ text: entry.answer.text ?? "", name: survey.anonymous ? null : entry.response.user.name }))
      .filter((entry) => entry.text.trim().length > 0);
    return { id: question.id, text: question.text, type: "TEXT" as const, texts };
  });

  return NextResponse.json({
    id: survey.id,
    title: survey.title,
    description: survey.description,
    anonymous: survey.anonymous,
    audience: survey.audience,
    // Índice de clima 0-100 sobre las preguntas de escala.
    climateIndex: climateIndex(questions.filter((q): q is Extract<typeof q, { type: "RATING" }> => q.type === "RATING")),
    active: survey.active,
    responseCount: survey.responses.length,
    totalRecipients,
    questions
  });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  if (isApiError(session)) return session;
  if (session.role === "ASESOR") return NextResponse.json({ error: "Solo gerencia puede eliminar encuestas." }, { status: 403 });

  const survey = await prisma.survey.findFirst({ where: { id, storeId: session.storeId }, select: { id: true } });
  if (!survey) return NextResponse.json({ error: "Encuesta no encontrada." }, { status: 404 });
  await prisma.survey.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
