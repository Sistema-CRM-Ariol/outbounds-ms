import { Inject, Injectable, Logger } from '@nestjs/common';
import { CreateOutboundDto } from './dto/create-outbound.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { FilterPaginationDto } from 'src/common/dto/filter-pagination.dto';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { NATS_SERVICE } from 'src/config/services';
import { OutboundOrderStatus } from './types/outbound-order-status.type';
import { OutboundOrderType } from './types/outbound-order-type.type';

@Injectable()
export class OutboundsService {

    private readonly logger = new Logger('OutboundsService');

    constructor(
        private readonly prisma: PrismaService,
        @Inject(NATS_SERVICE) private readonly natsClient: ClientProxy,
    ) { }

    // ─── Crear Venta ────────────────────────────────────────────────
    async createSale(createOutboundDto: CreateOutboundDto) {
        const { items, ...outboundData } = createOutboundDto;

        const orderNumber = `VEN-${Date.now()}`;

        const newSale = await this.prisma.outboundOrder.create({
            data: {
                orderNumber,
                orderType: OutboundOrderType.Venta,
                ...outboundData,
                items: {
                    create: items,
                },
            },
            include: { items: true },
        });

        return {
            message: 'Venta creada correctamente',
            outbound: newSale,
        };
    }

    // ─── Crear Cotización ───────────────────────────────────────────
    async createQuotation(createOutboundDto: CreateOutboundDto) {
        const { items, ...outboundData } = createOutboundDto;

        const orderNumber = `COT-${Date.now()}`;

        const newQuotation = await this.prisma.outboundOrder.create({
            data: {
                orderNumber,
                orderType: OutboundOrderType.Cotizacion,
                ...outboundData,
                items: {
                    create: items,
                },
            },
            include: { items: true },
        });

        return {
            message: 'Cotización creada correctamente',
            outbound: newQuotation,
        };
    }

    // ─── Listar Ventas (paginado) ───────────────────────────────────
    async findAllSales(filterPaginationDto: FilterPaginationDto) {
        return this.findAllByType(OutboundOrderType.Venta, filterPaginationDto);
    }

    // ─── Listar Cotizaciones (paginado) ─────────────────────────────
    async findAllQuotations(filterPaginationDto: FilterPaginationDto) {
        return this.findAllByType(OutboundOrderType.Cotizacion, filterPaginationDto);
    }

    // ─── Buscar por orderNumber ─────────────────────────────────────
    async findOne(orderNumber: string) {
        const outboundOrder = await this.prisma.outboundOrder.findUnique({
            where: { orderNumber },
            include: {
                items: {
                    omit: {
                        outboundOrderId: true,
                        updatedAt: true,
                    },
                },
            },
        });

        if (!outboundOrder) {
            throw new RpcException({
                status: 404,
                message: `Orden ${orderNumber} no encontrada`,
            });
        }

        return { outboundOrder };
    }

    // ─── Cambiar estado ─────────────────────────────────────────────
    async changeStatus(orderNumber: string, newStatus: OutboundOrderStatus) {

        const existing = await this.prisma.outboundOrder.findUnique({
            where: { orderNumber },
        });

        if (!existing) {
            throw new RpcException({
                status: 404,
                message: `Orden ${orderNumber} no encontrada`,
            });
        }

        const updatedOutbound = await this.prisma.outboundOrder.update({
            where: { orderNumber },
            data: { status: newStatus },
            include: {
                items: {
                    select: { productId: true, quantityDispatched: true, quantityOrdered: true },
                },
            },
        });

        // Al completar una venta, descontar stock del inventario
        if (newStatus === OutboundOrderStatus.Completada && existing.orderType === OutboundOrderType.Venta) {
            this.natsClient.emit('inventories.updateSock', {
                warehouseId: updatedOutbound.warehouseId,
                items: updatedOutbound.items.map(item => ({
                    productId: item.productId,
                    quantity: -(item.quantityDispatched ?? item.quantityOrdered), // negativo para descontar
                })),
            });

            this.logger.log(`Stock descontado para orden ${orderNumber}`);
        }

        return {
            message: 'Estado de orden actualizado correctamente',
            outbound: updatedOutbound,
        };
    }

    // ─── Convertir Cotización a Venta ───────────────────────────────
    async convertQuotationToSale(orderNumber: string) {

        const quotation = await this.prisma.outboundOrder.findUnique({
            where: { orderNumber },
            include: { items: true },
        });

        if (!quotation) {
            throw new RpcException({
                status: 404,
                message: `Cotización ${orderNumber} no encontrada`,
            });
        }

        if (quotation.orderType !== OutboundOrderType.Cotizacion) {
            throw new RpcException({
                status: 400,
                message: `La orden ${orderNumber} no es una cotización, es una ${quotation.orderType}`,
            });
        }

        if (quotation.status === OutboundOrderStatus.Cancelada) {
            throw new RpcException({
                status: 400,
                message: `La cotización ${orderNumber} está cancelada y no puede convertirse en venta`,
            });
        }

        // Crear la venta nueva basada en la cotización
        const saleOrderNumber = `VEN-${Date.now()}`;

        const newSale = await this.prisma.$transaction(async (tx) => {
            // Crear la nueva venta con los mismos datos
            const sale = await tx.outboundOrder.create({
                data: {
                    orderNumber: saleOrderNumber,
                    orderType: OutboundOrderType.Venta,
                    issueDate: new Date(),
                    expectedDispatch: quotation.expectedDispatch,
                    customerId: quotation.customerId,
                    customerName: quotation.customerName,
                    warehouseId: quotation.warehouseId,
                    warehouseName: quotation.warehouseName,
                    subtotal: quotation.subtotal,
                    tax: quotation.tax,
                    discount: quotation.discount,
                    total: quotation.total,
                    currency: quotation.currency,
                    shippingAddress: quotation.shippingAddress,
                    shippingMethod: quotation.shippingMethod,
                    carrier: quotation.carrier,
                    notes: quotation.notes,
                    createdBy: quotation.createdBy,
                    createdByName: quotation.createdByName,
                    status: OutboundOrderStatus.Pendiente,
                    items: {
                        create: quotation.items.map(item => ({
                            productId: item.productId,
                            productName: item.productName,
                            productSerialNumber: item.productSerialNumber,
                            quantityOrdered: item.quantityOrdered,
                            quantityDispatched: 0,
                            unitPrice: item.unitPrice,
                            discount: item.discount,
                            subtotal: item.subtotal,
                        })),
                    },
                },
                include: { items: true },
            });

            // Marcar la cotización original como completada
            await tx.outboundOrder.update({
                where: { orderNumber },
                data: { status: OutboundOrderStatus.Completada },
            });

            return sale;
        });

        return {
            message: `Cotización ${orderNumber} convertida a venta ${saleOrderNumber} exitosamente`,
            originalQuotation: orderNumber,
            sale: newSale,
        };
    }

    // ─── Método privado para listar por tipo ────────────────────────
    private async findAllByType(orderType: OutboundOrderType, filterPaginationDto: FilterPaginationDto) {
        const { page, limit, search } = filterPaginationDto;

        const filters: any[] = [
            { orderType },
        ];

        if (search) {
            filters.push({
                OR: [
                    { orderNumber: { contains: search, mode: 'insensitive' } },
                    { customerName: { contains: search, mode: 'insensitive' } },
                ],
            });
        }

        const whereClause = { AND: filters };

        const [totalOutbounds, outbounds] = await Promise.all([
            this.prisma.outboundOrder.count({
                where: whereClause,
            }),
            this.prisma.outboundOrder.findMany({
                take: limit,
                skip: (page! - 1) * limit!,
                orderBy: { updatedAt: 'desc' },
                where: whereClause,
                select: {
                    orderNumber: true,
                    orderType: true,
                    issueDate: true,
                    expectedDispatch: true,
                    actualDispatch: true,
                    customerName: true,
                    warehouseName: true,
                    subtotal: true,
                    tax: true,
                    discount: true,
                    total: true,
                    currency: true,
                    status: true,
                    createdAt: true,
                    updatedAt: true,
                    _count: { select: { items: true } },
                },
            }),
        ]);

        const lastPage = Math.ceil(totalOutbounds / limit!);

        return {
            outbounds,
            meta: {
                page,
                lastPage,
                total: totalOutbounds,
            },
        };
    }
}
