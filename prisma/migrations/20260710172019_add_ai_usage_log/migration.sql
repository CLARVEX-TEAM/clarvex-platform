-- CreateTable
CREATE TABLE "AiMemory" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "userId" TEXT,
    "key" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiMemory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiPlanHistory" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "kpisUsed" TEXT NOT NULL,
    "focus" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "activities" TEXT[],
    "outcomeSales" DECIMAL(12,2),
    "outcomeGoal" DECIMAL(12,2),
    "outcomeSuccess" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiPlanHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiRecommendationHistory" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "userId" TEXT,
    "type" TEXT NOT NULL,
    "recommendation" TEXT NOT NULL,
    "outcomeSuccess" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiRecommendationHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiDailySummary" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "summaryDate" DATE NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'STORE_DAILY',
    "scopeKey" TEXT NOT NULL DEFAULT 'STORE',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "content" JSONB,
    "metricsSnapshot" JSONB,
    "sourceDataHash" TEXT,
    "errorMessage" TEXT,
    "generatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiDailySummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiUsageLog" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "userId" TEXT,
    "feature" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "modelTier" TEXT NOT NULL,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "toolCalls" INTEGER NOT NULL DEFAULT 0,
    "iterations" INTEGER NOT NULL DEFAULT 0,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiMemory_storeId_key_idx" ON "AiMemory"("storeId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "AiMemory_storeId_userId_key_key" ON "AiMemory"("storeId", "userId", "key");

-- CreateIndex
CREATE INDEX "AiPlanHistory_storeId_userId_date_idx" ON "AiPlanHistory"("storeId", "userId", "date");

-- CreateIndex
CREATE INDEX "AiRecommendationHistory_storeId_userId_idx" ON "AiRecommendationHistory"("storeId", "userId");

-- CreateIndex
CREATE INDEX "AiDailySummary_storeId_summaryDate_idx" ON "AiDailySummary"("storeId", "summaryDate");

-- CreateIndex
CREATE UNIQUE INDEX "AiDailySummary_storeId_summaryDate_type_scopeKey_key" ON "AiDailySummary"("storeId", "summaryDate", "type", "scopeKey");

-- CreateIndex
CREATE INDEX "AiUsageLog_storeId_createdAt_idx" ON "AiUsageLog"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "AiUsageLog_userId_createdAt_idx" ON "AiUsageLog"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "AiMemory" ADD CONSTRAINT "AiMemory_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiMemory" ADD CONSTRAINT "AiMemory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiPlanHistory" ADD CONSTRAINT "AiPlanHistory_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiPlanHistory" ADD CONSTRAINT "AiPlanHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiRecommendationHistory" ADD CONSTRAINT "AiRecommendationHistory_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiRecommendationHistory" ADD CONSTRAINT "AiRecommendationHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiDailySummary" ADD CONSTRAINT "AiDailySummary_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
