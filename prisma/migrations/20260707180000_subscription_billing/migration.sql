-- Precio por usuario por tienda (MXN) y registro de pagos de suscripción (Mercado Pago).
ALTER TABLE "Store" ADD COLUMN "pricePerUserMxn" DECIMAL(10,2);

CREATE TABLE "SubscriptionPayment" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "mpPaymentId" TEXT NOT NULL,
    "amountMxn" DECIMAL(10,2) NOT NULL,
    "status" TEXT NOT NULL,
    "method" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionPayment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SubscriptionPayment_mpPaymentId_key" ON "SubscriptionPayment"("mpPaymentId");
CREATE INDEX "SubscriptionPayment_storeId_paidAt_idx" ON "SubscriptionPayment"("storeId", "paidAt");

ALTER TABLE "SubscriptionPayment" ADD CONSTRAINT "SubscriptionPayment_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
