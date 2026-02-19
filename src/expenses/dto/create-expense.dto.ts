import { $Enums, Prisma } from "@prisma/client";

export class CreateExpenseDto {
    code: string;
    description?: string;
    clientId: string;
    clientName: string;
    paymentMethod: string;
    warehouseId?: string;
    warehouseName?: string;
    type: $Enums.OutputType;
    total: number;
    status?: string;
}
