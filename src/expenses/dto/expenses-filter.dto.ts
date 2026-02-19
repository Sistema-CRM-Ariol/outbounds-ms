import { OutputType } from "@prisma/client";
import { FilterPaginationDto } from "src/common/dto/filter-pagination.dto";



export class ExpensesFilterDto extends FilterPaginationDto {
    paymentMethod?: string;
    type: OutputType;
}