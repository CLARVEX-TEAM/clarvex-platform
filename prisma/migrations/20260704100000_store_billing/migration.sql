-- AlterTable
ALTER TABLE "Store" ADD COLUMN "billingExempt" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Store" ADD COLUMN "subscriptionPaidUntil" TIMESTAMP(3);
