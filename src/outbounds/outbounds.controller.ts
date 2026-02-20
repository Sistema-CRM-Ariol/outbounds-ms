import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { OutboundsService } from './outbounds.service';
import { CreateOutboundDto } from './dto/create-outbound.dto';
import { FilterPaginationDto } from 'src/common/dto/filter-pagination.dto';
import { OutboundOrderStatus } from './types/outbound-order-status.type';

@Controller()
export class OutboundsController {
    constructor(private readonly outboundsService: OutboundsService) { }

    // ─── Ventas ─────────────────────────────────────────────────────

    @MessagePattern('outbounds.sales.create')
    createSale(@Payload() createOutboundDto: CreateOutboundDto) {
        return this.outboundsService.createSale(createOutboundDto);
    }

    @MessagePattern('outbounds.sales.findAll')
    findAllSales(@Payload() filterPaginationDto: FilterPaginationDto) {
        return this.outboundsService.findAllSales(filterPaginationDto);
    }

    // ─── Cotizaciones ───────────────────────────────────────────────

    @MessagePattern('outbounds.quotations.create')
    createQuotation(@Payload() createOutboundDto: CreateOutboundDto) {
        return this.outboundsService.createQuotation(createOutboundDto);
    }

    @MessagePattern('outbounds.quotations.findAll')
    findAllQuotations(@Payload() filterPaginationDto: FilterPaginationDto) {
        return this.outboundsService.findAllQuotations(filterPaginationDto);
    }

    @MessagePattern('outbounds.quotations.convertToSale')
    convertQuotationToSale(@Payload() orderNumber: string) {
        return this.outboundsService.convertQuotationToSale(orderNumber);
    }

    // ─── Comunes ────────────────────────────────────────────────────

    @MessagePattern('outbounds.findOne')
    findOne(@Payload() orderNumber: string) {
        return this.outboundsService.findOne(orderNumber);
    }

    @MessagePattern('outbounds.changeStatus')
    changeStatus(@Payload() payload: { orderNumber: string; status: OutboundOrderStatus }) {
        return this.outboundsService.changeStatus(payload.orderNumber, payload.status);
    }
}
