import { ADVISOR_WHERE, PERSON_WHERE } from "@/lib/store-people";
import { climateIndex, isSplit } from "@/lib/survey-climate";
import { NextResponse } from "next/server";
import { isApiError, requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { createNotifications } from "@/lib/notifications";
import { dispatchPushToUsers } from "@/lib/push";
import { z } from "zod";
import { parseJson } from "@/lib/api";

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

const patchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("publish") }),
  z.object({ action: z.literal("audience"), audience: z.enum(["ALL", "ADVISORS"]) })
]);

/**
 * Publica un borrador: lo hace visible y AHORA SÍ avisa a quien le toca.
 *
 * El aviso vive aquí y no en la creación a propósito: separar guardar de
 * publicar evita mandarle un push a la tienda entera con una encuesta a medio
 * escribir, que no tiene vuelta atrás.
 *
 * Es idempotente: publicar dos veces no manda el aviso dos veces.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (isApiError(session)) return session;
  if (session.role === "ASESOR") return NextResponse.json({ error: "No tienes permiso." }, { status: 403 });

  const parsed = await parseJson(request, patchSchema);
  if ("response" in parsed) return parsed.response;

  const { id } = await params;
  const survey = await prisma.survey.findFirst({
    where: { id, storeId: session.storeId },
    select: { id: true, title: true, active: true, audience: true }
  });
  if (!survey) return NextResponse.json({ error: "Encuesta no encontrada." }, { status: 404 });

  // Cambiar el destinatario SOLO mientras sea borrador. Despues de publicar ya
  // hay gente avisada: moverlo dejaria a unos con la encuesta y a otros sin
  // enterarse, y la tasa de respuesta pasaria a medir contra otro universo.
  if (parsed.data.action === "audience") {
    if (survey.active) {
      return NextResponse.json({ error: "Ya está publicada: no se puede cambiar a quién va dirigida." }, { status: 409 });
    }
    await prisma.survey.update({ where: { id: survey.id }, data: { audience: parsed.data.audience } });
    return NextResponse.json({ id: survey.id, audience: parsed.data.audience });
  }

  if (survey.active) return NextResponse.json({ id: survey.id, alreadyPublished: true });

  await prisma.survey.update({ where: { id: survey.id }, data: { active: true } });

  const recipients = await prisma.user.findMany({
    where: {
      storeId: session.storeId,
      ...(survey.audience === "ADVISORS" ? ADVISOR_WHERE : PERSON_WHERE),
      id: { not: session.userId }
    },
    select: { id: true }
  });
  const recipientIds = recipients.map((recipient) => recipient.id);
  if (recipientIds.length > 0) {
    await createNotifications(prisma, recipientIds.map((userId) => ({
      storeId: session.storeId, userId, type: "SURVEY" as const, title: "Nueva encuesta", body: survey.title
    })));
    dispatchPushToUsers(recipientIds, {
      title: "📝 Nueva encuesta",
      body: survey.title,
      tag: "encuesta",
      // Al tocar el aviso se abre ESA encuesta, no la lista.
      url: `/encuestas?encuesta=${survey.id}`
    }).catch(() => undefined);
  }

  return NextResponse.json({ id: survey.id, notified: recipientIds.length });
}
