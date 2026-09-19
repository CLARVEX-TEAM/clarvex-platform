-- Evaluación de capacitación: preguntas, intentos y constancia.
--
-- Aditiva: dos tablas nuevas. Nada de lo existente cambia; un recurso sin
-- cuestionario sigue funcionando exactamente igual que hoy.

-- CreateTable
CREATE TABLE "TrainingQuiz" (
    "id" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "passScore" INTEGER NOT NULL DEFAULT 80,
    "questions" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingQuiz_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingAttempt" (
    "id" TEXT NOT NULL,
    "quizId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "answers" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- Un cuestionario por recurso: dos evaluaciones del mismo material darían dos
-- constancias distintas de lo mismo.
CREATE UNIQUE INDEX "TrainingQuiz_resourceId_key" ON "TrainingQuiz"("resourceId");
CREATE INDEX "TrainingQuiz_storeId_idx" ON "TrainingQuiz"("storeId");
CREATE INDEX "TrainingAttempt_userId_createdAt_idx" ON "TrainingAttempt"("userId", "createdAt");
CREATE INDEX "TrainingAttempt_quizId_createdAt_idx" ON "TrainingAttempt"("quizId", "createdAt");
CREATE INDEX "TrainingAttempt_storeId_createdAt_idx" ON "TrainingAttempt"("storeId", "createdAt");

-- AddForeignKey
ALTER TABLE "TrainingQuiz" ADD CONSTRAINT "TrainingQuiz_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "TrainingResource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrainingQuiz" ADD CONSTRAINT "TrainingQuiz_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrainingAttempt" ADD CONSTRAINT "TrainingAttempt_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "TrainingQuiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrainingAttempt" ADD CONSTRAINT "TrainingAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
