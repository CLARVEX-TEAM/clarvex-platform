import { NextResponse } from "next/server";
import { z } from "zod";
import { denyDemo, isApiError, parseJson, requireSession } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import {
  MINIMO_POR_OMISION,
  calificar,
  paraResponder,
  problemasDelCuestionario,
  type Pregunta
} from "@/lib/capacitacion";
import { claveDeLaPeticion, conIdempotencia } from "@/lib/idempotencia-db";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * El cuestionario de un recurso de capacitación.
 *
 * ⚠️ **La respuesta correcta NUNCA sale de aquí.** Es la regla que sostiene que
 * «aprobado» signifique algo: mandarla al teléfono para pintar las opciones la
 * deja a la vista de cualquiera que abra las herramientas del navegador. Se
 * califica en el servidor, con las preguntas que tiene el servidor.
 */

const respuestaSchema = z.object({
  respuestas: z.record(z.string().max(64), z.number().int().min(0).max(32)).refine(
    (v) => Object.keys(v).length <= 100,
    "Demasiadas respuestas"
  )
});

const guardarSchema = z.object({
  passScore: z.number().int().min(1).max(100).default(MINIMO_POR_OMISION),
  preguntas: z.array(
    z.object({
      id: z.string().min(1).max(64),
      texto: z.string().min(1).max(500),
      opciones: z.array(z.string().min(1).max(200)).min(2).max(8),
      correcta: z.number().int().min(0).max(7)
    })
  ).min(1).max(50)
});

/** GET — el cuestionario para contestarlo, SIN respuestas, y lo que ya sacaste. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (isApiError(session)) return session;
  const { id } = await params;

  const quiz = await prisma.trainingQuiz.findFirst({
    where: { resourceId: id, storeId: session.storeId },
    select: { id: true, passScore: true, questions: true, resource: { select: { title: true } } }
  });
  if (!quiz) return NextResponse.json({ quiz: null });

  const preguntas = (quiz.questions as unknown as Pregunta[]) ?? [];

  const intentos = await prisma.trainingAttempt.findMany({
    where: { quizId: quiz.id, userId: session.userId },
    select: { score: true, passed: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 10
  });
  const aprobado = intentos.find((intento) => intento.passed) ?? null;

  return NextResponse.json({
    quiz: {
      titulo: quiz.resource.title,
      minimo: quiz.passScore,
      // ⚠️ Despojadas. Ver `paraResponder`.
      preguntas: paraResponder(preguntas)
    },
    /*
     * La constancia es el primer intento aprobado, no el último: la fecha en que
     * se acreditó no cambia porque alguien vuelva a hacer el examen.
     */
    constancia: aprobado ? { porcentaje: aprobado.score, fecha: aprobado.createdAt.toISOString() } : null,
    intentos: intentos.map((intento) => ({
      porcentaje: intento.score,
      aprobado: intento.passed,
      fecha: intento.createdAt.toISOString()
    }))
  }, { headers: { "Cache-Control": "private, no-store" } });
}

/** POST — contesta el cuestionario. La calificación se hace aquí. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (isApiError(session)) return session;
  const demo = denyDemo(session);
  if (demo) return demo;
  const { id } = await params;

  const parsed = await parseJson(request, respuestaSchema);
  if ("response" in parsed) return parsed.response;

  const quiz = await prisma.trainingQuiz.findFirst({
    where: { resourceId: id, storeId: session.storeId },
    select: { id: true, passScore: true, questions: true }
  });
  if (!quiz) return NextResponse.json({ error: "Este recurso no tiene cuestionario." }, { status: 404 });

  const preguntas = (quiz.questions as unknown as Pregunta[]) ?? [];
  const nota = calificar(preguntas, parsed.data.respuestas, quiz.passScore);

  /*
   * ⚠️ Con guarda de idempotencia: un reintento de la cola no puede dejar dos
   * intentos del mismo examen. Duplicarlos ensuciaría el historial, que es lo
   * que permite ver quién batalla con qué.
   */
  const sesion = session;
  const resultado = await conIdempotencia(
    {
      clave: claveDeLaPeticion(request),
      storeId: session.storeId,
      userId: session.userId,
      route: "/api/training/quiz",
      cuerpo: { quizId: quiz.id, respuestas: parsed.data.respuestas }
    },
    async () => {
      const intento = await prisma.trainingAttempt.create({
        data: {
          quizId: quiz.id,
          userId: sesion.userId,
          storeId: sesion.storeId,
          score: nota.porcentaje,
          passed: nota.aprobado,
          answers: parsed.data.respuestas
        }
      });
      return {
        status: 201,
        body: {
          /*
           * ⚠️ Se devuelve la NOTA, nunca qué preguntas se fallaron ni cuál era
           * la correcta. Con eso, repetir el examen dos veces da el 100% sin
           * haber aprendido nada, y la constancia deja de significar algo.
           */
          porcentaje: nota.porcentaje,
          aciertos: nota.aciertos,
          total: nota.total,
          aprobado: nota.aprobado,
          minimo: quiz.passScore,
          fecha: intento.createdAt.toISOString()
        }
      };
    }
  );
  return NextResponse.json(resultado.body, { status: resultado.status });
}

/** PUT — gerencia crea o cambia el cuestionario de un recurso. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (isApiError(session)) return session;
  const demo = denyDemo(session);
  if (demo) return demo;
  if (session.role !== "GERENTE" && session.role !== "SUBGERENTE" && !session.platformAdmin) {
    return NextResponse.json({ error: "Solo gerencia puede editar cuestionarios." }, { status: 403 });
  }
  const { id } = await params;

  const parsed = await parseJson(request, guardarSchema);
  if ("response" in parsed) return parsed.response;

  /*
   * ⚠️ Se valida al GUARDAR, no al contestar. Descubrir que la respuesta correcta
   * apunta fuera de la lista mientras alguien hace el examen le hace perder el
   * intento por un error que no es suyo.
   */
  const problemas = problemasDelCuestionario(parsed.data.preguntas);
  if (problemas.length > 0) {
    return NextResponse.json({ error: problemas.join(" ") }, { status: 400 });
  }

  const recurso = await prisma.trainingResource.findFirst({
    where: { id, storeId: session.storeId },
    select: { id: true, title: true }
  });
  if (!recurso) return NextResponse.json({ error: "Recurso no encontrado." }, { status: 404 });

  const quiz = await prisma.trainingQuiz.upsert({
    where: { resourceId: recurso.id },
    update: { passScore: parsed.data.passScore, questions: parsed.data.preguntas },
    create: {
      resourceId: recurso.id,
      storeId: session.storeId,
      passScore: parsed.data.passScore,
      questions: parsed.data.preguntas
    },
    select: { id: true }
  });

  await recordAudit({
    session,
    action: "training.quiz.save",
    entity: "TrainingQuiz",
    entityId: quiz.id,
    storeId: session.storeId,
    detail: `${recurso.title} · ${parsed.data.preguntas.length} preguntas · mínimo ${parsed.data.passScore}%`
  });

  return NextResponse.json({ ok: true, preguntas: parsed.data.preguntas.length });
}
