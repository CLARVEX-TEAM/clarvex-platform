ALTER TABLE "CommissionRule" ADD COLUMN "minAchievement" DECIMAL(5,2) NOT NULL DEFAULT 0;
ALTER TABLE "CommissionRule" ADD COLUMN "maxAchievement" DECIMAL(5,2);
