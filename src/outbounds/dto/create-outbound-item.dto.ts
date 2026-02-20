import { IsInt, IsNumber, IsOptional, IsPositive, IsString, IsUUID, Min } from "class-validator";

export class CreateOutboundItemDto {

    @IsUUID('4', { message: 'productId debe ser un UUID válido' })
    productId: string;

    @IsString({ message: 'productName debe ser un texto' })
    productName: string;

    @IsOptional()
    @IsString({ message: 'productSerialNumber debe ser un texto' })
    productSerialNumber?: string;

    @IsInt({ message: 'quantityOrdered debe ser un número entero' })
    @IsPositive({ message: 'quantityOrdered debe ser positivo' })
    quantityOrdered: number;

    @IsOptional()
    @IsInt({ message: 'quantityDispatched debe ser un número entero' })
    @Min(0, { message: 'quantityDispatched no puede ser negativo' })
    quantityDispatched?: number;

    @IsNumber({}, { message: 'unitPrice debe ser un número' })
    @IsPositive({ message: 'unitPrice debe ser positivo' })
    unitPrice: number;

    @IsOptional()
    @IsNumber({}, { message: 'discount debe ser un número' })
    @Min(0, { message: 'discount no puede ser negativo' })
    discount?: number;

    @IsNumber({}, { message: 'subtotal debe ser un número' })
    @IsPositive({ message: 'subtotal debe ser positivo' })
    subtotal: number;
}
