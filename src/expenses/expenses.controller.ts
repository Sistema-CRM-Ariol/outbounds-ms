import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { ExpensesService } from './expenses.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { ExpensesFilterDto } from './dto/expenses-filter.dto';

@Controller()
export class ExpensesController {
    constructor(private readonly expensesService: ExpensesService) { }

    @MessagePattern('expenses.create')
    create(@Payload() createExpenseDto: CreateExpenseDto) {
        return this.expensesService.create(createExpenseDto);
    }

    @MessagePattern('expenses.findAll')
    findAll(@Payload() expensesFilterDto: ExpensesFilterDto) {
        return this.expensesService.findAll(expensesFilterDto);
    }

    @MessagePattern('expenses.findOne')
    findOne(@Payload() id: number) {
        return this.expensesService.findOne(id);
    }
}
