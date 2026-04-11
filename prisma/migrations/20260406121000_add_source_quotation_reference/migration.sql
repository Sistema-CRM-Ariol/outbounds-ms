-- AlterTable
ALTER TABLE "outbound_orders"
ADD COLUMN "sourceQuotationOrderNumber" TEXT;

-- CreateIndex
CREATE INDEX "outbound_orders_sourceQuotationOrderNumber_idx" ON "outbound_orders"("sourceQuotationOrderNumber");
