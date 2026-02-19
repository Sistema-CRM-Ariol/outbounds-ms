import { Injectable } from '@nestjs/common';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { ExpensesFilterDto } from './dto/expenses-filter.dto';

@Injectable()
export class ExpensesService {

    constructor(
        private readonly prisma: PrismaService
    ) { }

    async create(createExpenseDto: CreateExpenseDto) {

        const expense = await this.prisma.expense.create({
            data: createExpenseDto
        });

        return expense;
    }

    async findAll(expensesFilter: ExpensesFilterDto) {
        const { page, limit, search, type = 'VENTA', paymentMethod } = expensesFilter;

        const filters: any[] = [
            { type },
            { paymentMethod: paymentMethod ? paymentMethod : undefined }
        ];

        if (search) {
            filters.push({
                OR: [
                    { name: { contains: search, mode: 'insensitive' } },
                    { address: { contains: search, mode: 'insensitive' } },
                ],
            });
        }

        // Si existen filtros, los combinamos en un AND; de lo contrario, la consulta no tiene filtro
        const whereClause = filters.length > 0 ? { AND: filters } : {};

        // Ejecutamos la consulta de conteo y búsqueda con el mismo whereClause
        const [totalExpenses, expenses] = await Promise.all([
            this.prisma.expense.count({
                where: whereClause,
            }),
            this.prisma.expense.findMany({
                take: limit,
                skip: (page! - 1) * limit!,
                orderBy: { updatedAt: 'desc' },
                where: { ...whereClause, },
                include: {
                    _count: {
                        select: {
                            items: true,
                        },
                    }
                }
            }),
        ]);

        const lastPage = Math.ceil(totalExpenses / limit!);

        return {
            expenses,
            meta: {
                page,
                lastPage,
                total: totalExpenses,
            },
        };
    }

    findOne(id: number) {
        return `This action returns a #${id} expense`;
    }
}
