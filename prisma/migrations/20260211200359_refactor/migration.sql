-- CreateEnum
CREATE TYPE "OutputType" AS ENUM ('VENTA', 'REPOSICION', 'CONSIGNA', 'COTIZACION');

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "clientId" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "warehouseId" TEXT,
    "warehouseName" TEXT,
    "type" "OutputType" NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseItem" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "productId" TEXT,
    "productName" TEXT,
    "productPrice" DOUBLE PRECISION,
    "productTotal" DOUBLE PRECISION,
    "productQty" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Expense_code_key" ON "Expense"("code");

-- CreateIndex
CREATE INDEX "ExpenseItem_expenseId_idx" ON "ExpenseItem"("expenseId");

-- AddForeignKey
ALTER TABLE "ExpenseItem" ADD CONSTRAINT "ExpenseItem_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;
