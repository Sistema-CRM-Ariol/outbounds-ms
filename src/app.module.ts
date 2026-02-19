import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { ExpensesModule } from './expenses/expenses.module';

@Module({
  imports: [PrismaModule, ExpensesModule],
})
export class AppModule {}
