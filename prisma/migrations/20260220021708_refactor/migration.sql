/*
  Warnings:

  - You are about to drop the `Expense` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ExpenseItem` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "OutboundOrderStatus" AS ENUM ('Pendiente', 'Preparando', 'Lista', 'Despachada', 'Completada', 'Cancelada');

-- CreateEnum
CREATE TYPE "OutboundOrderType" AS ENUM ('Venta', 'Cotizacion');

-- DropForeignKey
ALTER TABLE "ExpenseItem" DROP CONSTRAINT "ExpenseItem_expenseId_fkey";

-- DropTable
DROP TABLE "Expense";

-- DropTable
DROP TABLE "ExpenseItem";

-- DropEnum
DROP TYPE "OutputType";

-- CreateTable
CREATE TABLE "outbound_orders" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "orderType" "OutboundOrderType" NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expectedDispatch" TIMESTAMP(3),
    "actualDispatch" TIMESTAMP(3),
    "customerId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "warehouseName" TEXT,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "tax" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "shippingAddress" TEXT,
    "shippingMethod" TEXT,
    "carrier" TEXT,
    "trackingNumber" TEXT,
    "status" "OutboundOrderStatus" NOT NULL DEFAULT 'Pendiente',
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outbound_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbound_order_items" (
    "id" SERIAL NOT NULL,
    "outboundOrderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "productSerialNumber" TEXT,
    "quantityOrdered" INTEGER NOT NULL,
    "quantityDispatched" INTEGER DEFAULT 0,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outbound_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "outbound_orders_orderNumber_key" ON "outbound_orders"("orderNumber");

-- AddForeignKey
ALTER TABLE "outbound_order_items" ADD CONSTRAINT "outbound_order_items_outboundOrderId_fkey" FOREIGN KEY ("outboundOrderId") REFERENCES "outbound_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
