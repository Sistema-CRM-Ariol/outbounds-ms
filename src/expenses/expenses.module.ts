import { Module } from '@nestjs/common';
import { ExpensesService } from './expenses.service';
import { ExpensesController } from './expenses.controller';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
    controllers: [ExpensesController],
    providers: [ExpensesService],
    imports: [PrismaModule]
})
export class ExpensesModule { }
