-- CreateTable
CREATE TABLE "TrainingResource" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "linkUrl" TEXT,
    "fileUrl" TEXT,
    "fileName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingResourceView" (
    "id" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingResourceView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrainingResource_storeId_createdAt_idx" ON "TrainingResource"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "TrainingResourceView_resourceId_idx" ON "TrainingResourceView"("resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingResourceView_resourceId_userId_key" ON "TrainingResourceView"("resourceId", "userId");

-- AddForeignKey
ALTER TABLE "TrainingResource" ADD CONSTRAINT "TrainingResource_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingResource" ADD CONSTRAINT "TrainingResource_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingResourceView" ADD CONSTRAINT "TrainingResourceView_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "TrainingResource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingResourceView" ADD CONSTRAINT "TrainingResourceView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
