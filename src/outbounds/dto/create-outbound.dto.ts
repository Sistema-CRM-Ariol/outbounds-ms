import { IsArray, IsDateString, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { CreateOutboundItemDto } from "./create-outbound-item.dto";
import { OutboundOrderStatus } from "../types/outbound-order-status.type";
import { OutboundOrderType } from "../types/outbound-order-type.type";

export class CreateOutboundDto {

    @IsEnum(OutboundOrderType, { message: 'orderType debe ser Venta o Cotizacion' })
    @IsNotEmpty({ message: 'El tipo de orden es obligatorio' })
    orderType: OutboundOrderType;

    @IsOptional()
    @IsDateString({}, { message: 'issueDate debe ser una fecha válida en formato ISO 8601' })
    issueDate?: string;

    @IsOptional()
    @IsDateString({}, { message: 'expectedDispatch debe ser una fecha válida ISO 8601' })
    expectedDispatch?: string | Date;

    @IsOptional()
    @IsDateString({}, { message: 'actualDispatch debe ser una fecha válida ISO 8601' })
    actualDispatch?: string | Date;

    // Cliente
    @IsUUID('4', { message: 'customerId debe ser un UUID válido' })
    @IsNotEmpty({ message: 'El campo customerId es obligatorio' })
    customerId: string;

    @IsNotEmpty({ message: 'El nombre del cliente es obligatorio' })
    @IsString({ message: 'customerName debe ser un texto' })
    customerName: string;

    // Almacén
    @IsUUID('4', { message: 'warehouseId debe ser un UUID válido' })
    @IsNotEmpty({ message: 'El campo warehouseId es obligatorio' })
    warehouseId: string;

    @IsOptional()
    @IsString({ message: 'warehouseName debe ser un texto' })
    warehouseName?: string;

    // Montos
    @IsNumber({}, { message: 'subtotal debe ser un número' })
    @Min(0, { message: 'subtotal no puede ser negativo' })
    subtotal: number;

    @IsOptional()
    @IsNumber({}, { message: 'tax debe ser un número' })
    @Min(0, { message: 'tax no puede ser negativo' })
    tax?: number;

    @IsOptional()
    @IsNumber({}, { message: 'discount debe ser un número' })
    @Min(0, { message: 'discount no puede ser negativo' })
    discount?: number;

    @IsNumber({}, { message: 'total debe ser un número' })
    @Min(0, { message: 'total no puede ser negativo' })
    total: number;

    @IsOptional()
    @IsString({ message: 'currency debe ser un texto' })
    currency?: string;

    // Envío
    @IsOptional()
    @IsString({ message: 'shippingAddress debe ser un texto' })
    shippingAddress?: string;

    @IsOptional()
    @IsString({ message: 'shippingMethod debe ser un texto' })
    shippingMethod?: string;

    @IsOptional()
    @IsString({ message: 'carrier debe ser un texto' })
    carrier?: string;

    @IsOptional()
    @IsString({ message: 'trackingNumber debe ser un texto' })
    trackingNumber?: string;

    // Estado y notas
    @IsOptional()
    @IsEnum(OutboundOrderStatus, {
        message: 'El estado debe ser uno de: Pendiente, Preparando, Lista, Despachada, Completada, Cancelada',
    })
    status?: OutboundOrderStatus;

    @IsOptional()
    @IsString({ message: 'notes debe ser un texto' })
    notes?: string;

    // Auditoría
    @IsUUID('4', { message: 'createdBy debe ser un UUID válido' })
    @IsNotEmpty({ message: 'createdBy es obligatorio' })
    createdBy: string;

    @IsOptional()
    @IsString({ message: 'createdByName debe ser un texto' })
    createdByName?: string;

    // Items
    @IsOptional()
    @ValidateNested({ each: true })
    @Type(() => CreateOutboundItemDto)
    @IsArray({ message: 'items debe ser un arreglo de ítems' })
    items?: CreateOutboundItemDto[];
}
