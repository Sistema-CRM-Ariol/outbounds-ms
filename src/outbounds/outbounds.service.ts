import { Inject, Injectable, Logger, HttpStatus } from '@nestjs/common';
import { CreateOutboundDto } from './dto/create-outbound.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { FilterPaginationDto } from 'src/common/dto/filter-pagination.dto';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { NATS_SERVICE } from 'src/config/services';
import { OutboundOrderStatus } from './types/outbound-order-status.type';
import { OutboundOrderType } from './types/outbound-order-type.type';

type OutboundInventoryAction = 'RESERVAR' | 'LIBERAR' | 'CONSUMIR' | 'REVERTIR';

@Injectable()
export class OutboundsService {

    private readonly logger = new Logger('OutboundsService');

    constructor(
        private readonly prisma: PrismaService,
        @Inject(NATS_SERVICE) private readonly natsClient: ClientProxy,
    ) { }

    // ─── Dashboard Stats: Ventas ────────────────────────────────────
    async getSalesStats() {

        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

        const salesFilter = {
            orderType: OutboundOrderType.Venta,
            createdAt: { gte: startOfMonth },
        };

        const prevMonthSalesFilter = {
            orderType: OutboundOrderType.Venta,
            createdAt: { gte: startOfPrevMonth, lt: startOfMonth },
        };

        const [
            currentMonthSales,
            prevMonthSales,
            salesCount,
        ] = await Promise.all([
            this.prisma.outboundOrder.findMany({
                where: salesFilter,
                select: { total: true, currency: true },
            }),
            this.prisma.outboundOrder.findMany({
                where: prevMonthSalesFilter,
                select: { total: true, currency: true },
            }),
            this.prisma.outboundOrder.count({
                where: salesFilter,
            }),
        ]);

        // Total facturado este mes por moneda
        const totalBilledUSD = currentMonthSales
            .filter(s => s.currency === 'USD')
            .reduce((sum, s) => sum + Number(s.total), 0);

        const totalBilledBOB = currentMonthSales
            .filter(s => s.currency === 'BOB')
            .reduce((sum, s) => sum + Number(s.total), 0);

        const totalBilledThisMonth = totalBilledUSD + totalBilledBOB;

        // Promedio por venta
        const avgPerSale = salesCount > 0
            ? parseFloat((totalBilledThisMonth / salesCount).toFixed(2))
            : 0;

        // Crecimiento vs mes anterior
        const totalBilledPrevMonth = prevMonthSales.reduce(
            (sum, s) => sum + Number(s.total), 0,
        );

        const growthVsPrevMonth = totalBilledPrevMonth > 0
            ? parseFloat((((totalBilledThisMonth - totalBilledPrevMonth) / totalBilledPrevMonth) * 100).toFixed(2))
            : 0;

        return {
            totalBilledUSD: parseFloat(totalBilledUSD.toFixed(2)),
            totalBilledBOB: parseFloat(totalBilledBOB.toFixed(2)),
            avgPerSale,
            salesCount,
            growthVsPrevMonth,
        };
    }

    // ─── Dashboard Stats: Cotizaciones ──────────────────────────────
    async getQuotationsStats() {

        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        const quotationType = OutboundOrderType.Cotizacion;

        const [totalGenerated, pendingQuotations, monthQuotations] = await Promise.all([
            this.prisma.outboundOrder.count({
                where: {
                    orderType: quotationType,
                    createdAt: { gte: startOfMonth },
                },
            }),
            this.prisma.outboundOrder.count({
                where: {
                    orderType: quotationType,
                    status: OutboundOrderStatus.Pendiente,
                },
            }),
            this.prisma.outboundOrder.findMany({
                where: {
                    orderType: quotationType,
                    createdAt: { gte: startOfMonth },
                },
                select: { total: true },
            }),
        ]);

        const totalQuotedAmount = monthQuotations.reduce(
            (sum, q) => sum + Number(q.total), 0,
        );

        return {
            totalGenerated,
            pending: pendingQuotations,
            totalQuotedAmount: parseFloat(totalQuotedAmount.toFixed(2)),
        };
    }

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

        try {
            await this.applyInventoryOperation({
                action: 'CONSUMIR',
                operationType: 'VENTA',
                referenceId: newSale.orderNumber,
                warehouseId: newSale.warehouseId,
                warehouseName: newSale.warehouseName,
                sourceService: 'outbounds-ms',
                userId: newSale.createdBy,
                userName: newSale.createdByName,
                notes: 'Consumo de stock por generacion de venta',
                items: newSale.items.map(item => ({
                    productId: item.productId,
                    productName: item.productName,
                    productCode: item.productSerialNumber,
                    quantity: item.quantityOrdered,
                    consumeFromReservation: false,
                })),
            });
        } catch (error) {
            await this.prisma.outboundOrder.delete({
                where: { id: newSale.id },
            });

            throw error;
        }

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

        if (newQuotation.status === OutboundOrderStatus.Pendiente) {
            try {
                await this.applyInventoryOperation({
                    action: 'RESERVAR',
                    operationType: 'COTIZACION',
                    referenceId: newQuotation.orderNumber,
                    warehouseId: newQuotation.warehouseId,
                    warehouseName: newQuotation.warehouseName,
                    sourceService: 'outbounds-ms',
                    userId: newQuotation.createdBy,
                    userName: newQuotation.createdByName,
                    notes: 'Reserva de stock por cotizacion en estado pendiente',
                    items: newQuotation.items.map(item => ({
                        productId: item.productId,
                        productName: item.productName,
                        productCode: item.productSerialNumber,
                        quantity: item.quantityOrdered,
                    })),
                });
            } catch (error) {
                await this.prisma.outboundOrder.delete({
                    where: { id: newQuotation.id },
                });

                throw error;
            }
        }

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
            include: {
                items: {
                    select: {
                        productId: true,
                        productName: true,
                        productSerialNumber: true,
                        quantityOrdered: true,
                        quantityDispatched: true,
                    },
                },
            },
        });

        if (!existing) {
            throw new RpcException({
                status: 404,
                message: `Orden ${orderNumber} no encontrada`,
            });
        }

        if (existing.status === newStatus) {
            return {
                message: 'El estado ya se encuentra actualizado',
                outbound: existing,
            };
        }

        const updatedOutbound = await this.prisma.outboundOrder.update({
            where: { orderNumber },
            data: { status: newStatus },
            include: {
                items: {
                    select: {
                        productId: true,
                        productName: true,
                        productSerialNumber: true,
                        quantityDispatched: true,
                        quantityOrdered: true,
                    },
                },
            },
        });

        // Al completar una venta directa, descontar stock del inventario
        if (newStatus === OutboundOrderStatus.Completada && existing.orderType === OutboundOrderType.Venta) {
            const isConvertedSale = Boolean((existing as any).sourceQuotationOrderNumber);

            if (!isConvertedSale) {
                await this.applyInventoryOperation({
                    action: 'CONSUMIR',
                    operationType: 'VENTA',
                    referenceId: updatedOutbound.orderNumber,
                    warehouseId: updatedOutbound.warehouseId,
                    warehouseName: updatedOutbound.warehouseName,
                    sourceService: 'outbounds-ms',
                    userId: updatedOutbound.createdBy,
                    userName: updatedOutbound.createdByName,
                    notes: 'Consumo de stock por venta completada',
                    items: updatedOutbound.items.map(item => ({
                        productId: item.productId,
                        productName: item.productName,
                        productCode: item.productSerialNumber,
                        quantity: item.quantityDispatched ?? item.quantityOrdered,
                        consumeFromReservation: false,
                    })),
                });

                this.logger.log(`Stock descontado para orden ${orderNumber}`);
            }
        }

        if (
            newStatus === OutboundOrderStatus.Cancelada
            && existing.orderType === OutboundOrderType.Cotizacion
            && existing.status !== OutboundOrderStatus.Completada
        ) {
            await this.applyInventoryOperation({
                action: 'LIBERAR',
                operationType: 'COTIZACION',
                referenceId: existing.orderNumber,
                warehouseId: existing.warehouseId,
                warehouseName: existing.warehouseName,
                sourceService: 'outbounds-ms',
                userId: existing.createdBy,
                userName: existing.createdByName,
                notes: 'Liberacion de reserva por cancelacion de cotizacion',
                items: existing.items.map(item => ({
                    productId: item.productId,
                    productName: item.productName,
                    productCode: item.productSerialNumber,
                    quantity: item.quantityOrdered,
                })),
            });
        }

        if (newStatus === OutboundOrderStatus.Cancelada && existing.orderType === OutboundOrderType.Venta) {
            const isConvertedSale = Boolean((existing as any).sourceQuotationOrderNumber);

            if (isConvertedSale) {
                await this.applyInventoryOperation({
                    action: 'REVERTIR',
                    operationType: 'VENTA',
                    referenceId: existing.orderNumber,
                    warehouseId: existing.warehouseId,
                    warehouseName: existing.warehouseName,
                    sourceService: 'outbounds-ms',
                    userId: existing.createdBy,
                    userName: existing.createdByName,
                    notes: 'Reversa de stock por cancelacion de venta convertida',
                    items: existing.items.map(item => ({
                        productId: item.productId,
                        productName: item.productName,
                        productCode: item.productSerialNumber,
                        quantity: item.quantityOrdered,
                    })),
                });
            }
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
                    sourceQuotationOrderNumber: orderNumber,
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

        await this.applyInventoryOperation({
            action: 'CONSUMIR',
            operationType: 'VENTA',
            referenceId: newSale.orderNumber,
            warehouseId: newSale.warehouseId,
            warehouseName: newSale.warehouseName,
            sourceService: 'outbounds-ms',
            userId: newSale.createdBy,
            userName: newSale.createdByName,
            notes: `Consumo de reserva por conversion de cotizacion ${orderNumber}`,
            items: newSale.items.map(item => ({
                productId: item.productId,
                productName: item.productName,
                productCode: item.productSerialNumber,
                quantity: item.quantityOrdered,
                consumeFromReservation: true,
            })),
        });

        return {
            message: `Cotización ${orderNumber} convertida a venta ${saleOrderNumber} exitosamente`,
            originalQuotation: orderNumber,
            sale: newSale,
        };
    }

    private async applyInventoryOperation(payload: {
        action: OutboundInventoryAction;
        operationType: 'COTIZACION' | 'VENTA';
        referenceId: string;
        warehouseId: string;
        warehouseName?: string | null;
        sourceService: string;
        userId?: string;
        userName?: string | null;
        notes?: string | null;
        items: Array<{
            productId: string;
            productName?: string;
            productCode?: string | null;
            quantity: number;
            consumeFromReservation?: boolean;
        }>;
    }) {
        const items = payload.items
            .map(item => ({
                ...item,
                quantity: Math.trunc(Math.abs(Number(item.quantity))),
            }))
            .filter(item => Number.isFinite(item.quantity) && item.quantity > 0);

        if (items.length === 0) {
            return;
        }

        try {
            await firstValueFrom(
                this.natsClient.send('inventories.operations.apply', {
                    action: payload.action,
                    operationType: payload.operationType,
                    referenceId: payload.referenceId,
                    referenceType: payload.operationType,
                    warehouseId: payload.warehouseId,
                    warehouseName: payload.warehouseName ?? undefined,
                    sourceService: payload.sourceService,
                    userId: payload.userId ?? 'system',
                    userName: payload.userName ?? 'system',
                    notes: payload.notes ?? undefined,
                    items,
                }),
            );
        } catch (error) {
            const typedError = error as any;

            throw new RpcException({
                status: HttpStatus.BAD_REQUEST,
                message:
                    typedError?.message
                    ?? typedError?.response?.message
                    ?? 'No se pudo aplicar la operacion de inventario',
            });
        }
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

    async getSalesDashboard() {
        const now = new Date();
        const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);

        // Ventas de los últimos 12 meses
        const recentSales = await this.prisma.outboundOrder.findMany({
            where: {
                orderType: OutboundOrderType.Venta,
                createdAt: { gte: twelveMonthsAgo },
            },
            select: {
                total: true, currency: true,
                customerId: true, customerName: true,
                createdAt: true,
                items: { select: { productId: true, productName: true, quantityOrdered: true } },
            },
        });

        // Chart mensual de 12 meses
        const monthlyMap: Record<string, { month: string; totalUSD: number; totalBOB: number; count: number }> = {};
        for (let i = 11; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            monthlyMap[key] = { month: key, totalUSD: 0, totalBOB: 0, count: 0 };
        }
        for (const sale of recentSales) {
            const key = `${sale.createdAt.getFullYear()}-${String(sale.createdAt.getMonth() + 1).padStart(2, '0')}`;
            if (monthlyMap[key]) {
                monthlyMap[key].count++;
                if (sale.currency === 'USD') monthlyMap[key].totalUSD += Number(sale.total);
                else monthlyMap[key].totalBOB += Number(sale.total);
            }
        }
        const twelveMonthChart = Object.values(monthlyMap).map(m => ({
            ...m,
            totalUSD: parseFloat(m.totalUSD.toFixed(2)),
            totalBOB: parseFloat(m.totalBOB.toFixed(2)),
        }));

        // Top 10 clientes por volumen total (histórico)
        const allSales = await this.prisma.outboundOrder.findMany({
            where: { orderType: OutboundOrderType.Venta },
            select: { customerId: true, customerName: true, total: true },
        });
        const clientTotals: Record<string, { customerId: string; customerName: string; total: number }> = {};
        for (const sale of allSales) {
            if (!clientTotals[sale.customerId]) {
                clientTotals[sale.customerId] = { customerId: sale.customerId, customerName: sale.customerName, total: 0 };
            }
            clientTotals[sale.customerId].total += Number(sale.total);
        }
        const topClients = Object.values(clientTotals)
            .sort((a, b) => b.total - a.total)
            .slice(0, 10)
            .map(c => ({ ...c, total: parseFloat(c.total.toFixed(2)) }));

        // Best sellers de los últimos 12 meses (por cantidad pedida)
        const productTotals: Record<string, { productId: string; productName: string; totalQty: number }> = {};
        for (const sale of recentSales) {
            for (const item of sale.items) {
                if (!productTotals[item.productId]) {
                    productTotals[item.productId] = { productId: item.productId, productName: item.productName, totalQty: 0 };
                }
                productTotals[item.productId].totalQty += item.quantityOrdered;
            }
        }
        const bestSellers = Object.values(productTotals)
            .sort((a, b) => b.totalQty - a.totalQty)
            .slice(0, 10);

        return { twelveMonthChart, topClients, bestSellers };
    }

    async getQuotationsDashboard() {
        const now = new Date();
        const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

        const recentQuotations = await this.prisma.outboundOrder.findMany({
            where: {
                orderType: OutboundOrderType.Cotizacion,
                createdAt: { gte: sixMonthsAgo },
            },
            select: { total: true, status: true, createdAt: true },
        });

        // Chart mensual de 6 meses con tasa de conversión
        const monthlyMap: Record<string, { month: string; quotations: number; converted: number; totalAmount: number }> = {};
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            monthlyMap[key] = { month: key, quotations: 0, converted: 0, totalAmount: 0 };
        }
        for (const q of recentQuotations) {
            const key = `${q.createdAt.getFullYear()}-${String(q.createdAt.getMonth() + 1).padStart(2, '0')}`;
            if (monthlyMap[key]) {
                monthlyMap[key].quotations++;
                monthlyMap[key].totalAmount += Number(q.total);
                if (q.status === OutboundOrderStatus.Completada) monthlyMap[key].converted++;
            }
        }
        const sixMonthChart = Object.values(monthlyMap).map(m => ({
            ...m,
            conversionRate: m.quotations > 0
                ? parseFloat(((m.converted / m.quotations) * 100).toFixed(2))
                : 0,
            totalAmount: parseFloat(m.totalAmount.toFixed(2)),
        }));

        return { sixMonthChart };
    }

    async getCustomerAnalytics(customerId: string) {
        const outboundOrders = await this.prisma.outboundOrder.findMany({
            where: { customerId },
            orderBy: { createdAt: 'asc' },
            select: {
                id: true,
                orderType: true,
                status: true,
                total: true,
                currency: true,
                shippingMethod: true,
                createdAt: true,
                items: {
                    select: {
                        productId: true,
                        productName: true,
                        quantityOrdered: true,
                        unitPrice: true,
                    },
                },
            },
        });

        const nonCancelled = outboundOrders.filter(
            (order) => order.status !== OutboundOrderStatus.Cancelada,
        );

        const sales = nonCancelled.filter(
            (order) => order.orderType === OutboundOrderType.Venta,
        );

        const quotations = nonCancelled.filter(
            (order) => order.orderType === OutboundOrderType.Cotizacion,
        );

        const now = new Date();
        const startOf30d = new Date(now);
        startOf30d.setDate(now.getDate() - 30);

        const startOf90d = new Date(now);
        startOf90d.setDate(now.getDate() - 90);

        const totalSpent = sales.reduce((acc, sale) => acc + Number(sale.total), 0);
        const averageTicket = sales.length > 0 ? totalSpent / sales.length : 0;

        const lastOrderDate = nonCancelled.length > 0
            ? nonCancelled[nonCancelled.length - 1].createdAt
            : null;

        const ordersLast30d = nonCancelled.filter((order) => order.createdAt >= startOf30d).length;
        const ordersLast90d = nonCancelled.filter((order) => order.createdAt >= startOf90d).length;

        const monthlyFrequencyMap: Record<string, number> = {};
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            monthlyFrequencyMap[key] = 0;
        }

        for (const order of nonCancelled) {
            const key = `${order.createdAt.getFullYear()}-${String(order.createdAt.getMonth() + 1).padStart(2, '0')}`;
            if (monthlyFrequencyMap[key] !== undefined) {
                monthlyFrequencyMap[key] += 1;
            }
        }

        const shippingMethodCount: Record<string, number> = {};
        const productCountByUnits: Record<string, { productId: string; productName: string; units: number; amount: number }> = {};

        for (const sale of sales) {
            if (sale.shippingMethod) {
                shippingMethodCount[sale.shippingMethod] = (shippingMethodCount[sale.shippingMethod] ?? 0) + 1;
            }

            for (const item of sale.items) {
                if (!productCountByUnits[item.productId]) {
                    productCountByUnits[item.productId] = {
                        productId: item.productId,
                        productName: item.productName,
                        units: 0,
                        amount: 0,
                    };
                }

                const units = item.quantityOrdered;
                const amount = Number(item.unitPrice) * units;

                productCountByUnits[item.productId].units += units;
                productCountByUnits[item.productId].amount += amount;
            }
        }

        const topProducts = Object.values(productCountByUnits)
            .sort((a, b) => b.units - a.units)
            .slice(0, 5)
            .map((p) => ({
                ...p,
                amount: Number(p.amount.toFixed(2)),
            }));

        const currencyCount = sales.reduce((acc, sale) => {
            acc[sale.currency] = (acc[sale.currency] ?? 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        const preferredCurrency = Object.entries(currencyCount)
            .sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

        const preferredShippingMethod = Object.entries(shippingMethodCount)
            .sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

        return {
            analytics: {
                summary: {
                    totalOrders: nonCancelled.length,
                    totalSales: sales.length,
                    totalQuotations: quotations.length,
                    totalSpent: Number(totalSpent.toFixed(2)),
                    averageTicket: Number(averageTicket.toFixed(2)),
                },
                frequency: {
                    ordersLast30d,
                    ordersLast90d,
                    lastOrderDate,
                    monthly: Object.entries(monthlyFrequencyMap).map(([month, orders]) => ({ month, orders })),
                },
                preferences: {
                    preferredCurrency,
                    preferredShippingMethod,
                    topProducts,
                },
            }
        };
    }
}
